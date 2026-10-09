export default {
  battery(): number { return -1; },
  charging(): boolean { return false; },
  localMinutes(): number { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); },
};
