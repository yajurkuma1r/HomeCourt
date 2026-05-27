export const formatLocalDateTime = (value) => {
  if (!value) return '';
  const normalized = String(value).slice(0, 16);
  const [datePart, timePart = ''] = normalized.split('T');
  const [year, month, day] = datePart.split('-');
  const [hour = '00', minute = '00'] = timePart.split(':');

  if (!year || !month || !day) return String(value);

  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const localDateTimeToMs = (value) => {
  if (!value) return Number.NaN;
  const normalized = String(value).slice(0, 16);
  const [datePart, timePart = ''] = normalized.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
};
