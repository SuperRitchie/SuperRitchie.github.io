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
            <span>km this year</span>
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

        <h3>Recent activities</h3>
        <div class="strava-activity-list">
          ${activities.map((activity) => `
            <div class="strava-activity">
              <h4>
                <a href="${activityUrl(activity.id)}" target="_blank" rel="noopener">
                  ${activity.name}
                </a>
              </h4>
              <p>
                ${formatDate(activity.startDate)} · ${activity.type} · ${formatDecimal(activity.distanceKm)} km · ${formatDecimal(activity.movingHours)} hr · ${formatNumber(activity.elevationM)} m gain
              </p>
            </div>
          `).join('')}
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
