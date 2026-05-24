(function () {
  const root = document.getElementById('strava-root');

  if (!root) return;

  const formatNumber = (value) =>
    Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const formatDecimal = (value, digits = 1) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const formatDate = (isoDate) => {
    if (!isoDate) return 'Unknown date';
    return new Date(isoDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const activityUrl = (id) => `https://www.strava.com/activities/${id}`;

  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const formatActivityType = (type) =>
    String(type || 'Activity')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (match) => match.toUpperCase());

  function decodePolyline(encoded) {
    if (!encoded) return [];

    let index = 0;
    let lat = 0;
    let lng = 0;
    const points = [];

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte = null;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);

      lat += (result & 1) ? ~(result >> 1) : result >> 1;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);

      lng += (result & 1) ? ~(result >> 1) : result >> 1;
      points.push([lat / 1e5, lng / 1e5]);
    }

    return points;
  }

  function routeSvg(summaryPolyline) {
    const points = decodePolyline(summaryPolyline).filter(
      ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng),
    );

    if (points.length < 2) {
      return `
        <div class="strava-map strava-map-empty">
          <span>No route map</span>
        </div>
      `;
    }

    const width = 320;
    const height = 170;
    const padding = 16;
    const lats = points.map(([lat]) => lat);
    const lngs = points.map(([, lng]) => lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 1;
    const lngRange = maxLng - minLng || 1;

    const projected = points.map(([lat, lng]) => ({
      x: padding + ((lng - minLng) / lngRange) * (width - padding * 2),
      y: height - padding - ((lat - minLat) / latRange) * (height - padding * 2),
    }));

    const pathData = projected
      .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');

    const start = projected[0];
    const end = projected[projected.length - 1];

    return `
      <div class="strava-map">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="activity route preview">
          <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14"></rect>
          <path class="strava-route-shadow" d="${pathData}"></path>
          <path class="strava-route" d="${pathData}"></path>
          <circle class="strava-route-start" cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="3.5"></circle>
          <circle class="strava-route-end" cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="4.5"></circle>
        </svg>
      </div>
    `;
  }

  function typeBreakdown(byType) {
    const types = byType || [];
    if (types.length === 0) return '';

    const maxCount = Math.max(...types.map((item) => item.count || 0), 1);

    return `
      <div class="strava-types">
        <h3>Activity mix</h3>
        ${types.slice(0, 6).map((item) => `
          <div class="strava-type-row">
            <span>${escapeHtml(formatActivityType(item.type))}</span>
            <div class="strava-type-track">
              <div class="strava-type-fill" style="width: ${Math.max(8, ((item.count || 0) / maxCount) * 100)}%"></div>
            </div>
            <strong>${formatNumber(item.count)}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderActivityCard(activity) {
    return `
      <div class="strava-activity-card">
        ${routeSvg(activity.summaryPolyline)}
        <div class="strava-activity-body">
          <div class="strava-activity-topline">
            <span class="strava-pill">${escapeHtml(formatActivityType(activity.type))}</span>
            <span>${formatDate(activity.startDate)}</span>
          </div>
          <h4>
            <a href="${activityUrl(activity.id)}" target="_blank" rel="noopener">
              ${escapeHtml(activity.name)}
            </a>
          </h4>
          <p>
            ${formatDecimal(activity.distanceKm)} km · ${formatDecimal(activity.movingHours)} hr · ${formatNumber(activity.elevationM)} m gain
          </p>
        </div>
      </div>
    `;
  }

  async function loadStrava() {
    try {
      const response = await fetch('data/strava.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load Strava data');

      const data = await response.json();
      const stats = data.stats || {};
      const activities = data.recent || [];

      root.innerHTML = `
        <div class="strava-summary">
          <div class="strava-stat">
            <strong>${formatDecimal(stats.distanceKm)}</strong>
            <span>km all time</span>
          </div>
          <div class="strava-stat">
            <strong>${formatNumber(stats.activityCount)}</strong>
            <span>activities</span>
          </div>
          <div class="strava-stat">
            <strong>${formatDecimal(stats.movingHours)}</strong>
            <span>moving hours</span>
          </div>
          <div class="strava-stat">
            <strong>${formatNumber(stats.elevationM)}</strong>
            <span>m elevation gain</span>
          </div>
        </div>

        ${typeBreakdown(data.byType)}

        <h3>Latest activities</h3>
        <div class="strava-activity-grid">
          ${activities.length === 0 ? '<p>No Strava activities found yet.</p>' : activities.map(renderActivityCard).join('')}
        </div>

        <p class="strava-updated">
          Last updated ${formatDate(data.lastUpdated)}${data.profileUrl ? ` · <a href="${data.profileUrl}" target="_blank" rel="noopener">View my Strava profile</a>` : ''}
        </p>
      `;
    } catch (error) {
      root.innerHTML = '<p>Strava data is not available yet. Check back after the next monthly update.</p>';
    }
  }

  loadStrava();
})();
