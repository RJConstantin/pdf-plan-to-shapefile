const select = document.getElementById('anchorCoordStyle');

if (select && ![...select.options].some((option) => option.dataset.coordinateFormat === 'ddm')) {
  const dmsOption = [...select.options].find((option) => option.value === 'dms');
  if (dmsOption) dmsOption.textContent = 'Latitude / Longitude - Degrees Minutes Seconds (DMS)';

  const ddmOption = document.createElement('option');
  ddmOption.value = 'dms';
  ddmOption.dataset.coordinateFormat = 'ddm';
  ddmOption.textContent = 'Latitude / Longitude - Degrees Decimal Minutes (DDM)';

  if (dmsOption) select.insertBefore(ddmOption, dmsOption);
  else select.appendChild(ddmOption);

  function selectedIsDdm() {
    return select.options[select.selectedIndex]?.dataset.coordinateFormat === 'ddm';
  }

  function setLabelText(input, text) {
    const label = input?.closest('label');
    if (!label) return;
    const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = text;
  }

  function refreshCoordinateLabels() {
    requestAnimationFrame(() => {
      const lat = document.getElementById('anchorLatitudeDms');
      const lon = document.getElementById('anchorLongitudeDms');
      if (!lat || !lon) return;

      if (selectedIsDdm()) {
        setLabelText(lat, 'Latitude DDM');
        setLabelText(lon, 'Longitude DDM');
        lat.placeholder = "56° 57.53052' N";
        lon.placeholder = "111° 49.19650' W";
      } else {
        setLabelText(lat, 'Latitude DMS');
        setLabelText(lon, 'Longitude DMS');
        lat.placeholder = '56°57\'31.83"N';
        lon.placeholder = '111°49\'11.79"W';
      }
    });
  }

  select.addEventListener('change', refreshCoordinateLabels);

  document.getElementById('placeFromAnchor')?.addEventListener('click', () => {
    const wasDdm = selectedIsDdm();
    if (!wasDdm) return;
    setTimeout(() => {
      const status = document.getElementById('anchorStatus');
      if (status) {
        status.textContent = status.textContent
          .replace('using DMS', 'using Degrees Decimal Minutes (DDM)')
          .replace('DMS values', 'Degrees Decimal Minutes values');
      }
    }, 0);
  });

  refreshCoordinateLabels();
}
