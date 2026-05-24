const fs = require('fs');
const path = require('path');

const required = [
  'STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_SECRET',
  'STRAVA_REFRESH_TOKEN',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const tokenUrl = 'https://www.strava.com/oauth/token';
const apiBaseUrl = 'https://www.strava.com/api/v3';
const dataDir = path.join(process.cwd(), 'data');
const outputPath = path.join(dataDir, 'strava.json');
const refreshTokenPath = path.join(process.cwd(), '.strava-refresh-token');

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

async function refreshAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: process.env.STRAVA_REFRESH_TOKEN,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Strava token refresh failed: ${JSON.stringify(payload)}`);
  }

  if (payload.refresh_token && payload.refresh_token !== process.env.STRAVA_REFRESH_TOKEN) {
    fs.writeFileSync(refreshTokenPath, payload.refresh_token, 'utf8');
  }

  return payload.access_token;
}

async function stravaGet(pathname, accessToken, query = {}) {
  const url = new URL(`${apiBaseUrl}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Strava request failed: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function fetchActivities(accessToken) {
  const activities = [];
  let page = 1;
  const perPage = 100;
  const maxPages = Number(process.env.STRAVA_MAX_PAGES || 10);

  while (page <= maxPages) {
    const batch = await stravaGet('/athlete/activities', accessToken, {
      page,
      per_page: perPage,
    });

    activities.push(...batch);

    if (batch.length < perPage) break;
    page += 1;
  }

  return activities;
}

function getActivityType(activity) {
  return activity.sport_type || activity.type || 'Activity';
}

function summarize(activities) {
  const stats = activities.reduce(
    (acc, activity) => {
      const type = getActivityType(activity);

      acc.activityCount += 1;
      acc.distanceKm += (activity.distance || 0) / 1000;
      acc.movingHours += (activity.moving_time || 0) / 3600;
      acc.elevationM += activity.total_elevation_gain || 0;
      acc.typeCounts[type] = (acc.typeCounts[type] || 0) + 1;

      return acc;
    },
    { activityCount: 0, distanceKm: 0, movingHours: 0, elevationM: 0, typeCounts: {} },
  );

  const byType = Object.entries(stats.typeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  return {
    stats: {
      activityCount: stats.activityCount,
      distanceKm: round(stats.distanceKm, 1),
      movingHours: round(stats.movingHours, 1),
      elevationM: Math.round(stats.elevationM),
    },
    byType,
    recent: activities.slice(0, 8).map((activity) => ({
      id: activity.id,
      name: activity.name,
      type: getActivityType(activity),
      startDate: activity.start_date_local || activity.start_date,
      distanceKm: round((activity.distance || 0) / 1000, 1),
      movingHours: round((activity.moving_time || 0) / 3600, 1),
      elevationM: Math.round(activity.total_elevation_gain || 0),
      summaryPolyline: activity.map?.summary_polyline || '',
    })),
  };
}

async function main() {
  const accessToken = await refreshAccessToken();
  const athlete = await stravaGet('/athlete', accessToken);
  const activities = await fetchActivities(accessToken);
  const summary = summarize(activities);

  const output = {
    lastUpdated: new Date().toISOString(),
    profileUrl: athlete?.id ? `https://www.strava.com/athletes/${athlete.id}` : '',
    ...summary,
  };

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
