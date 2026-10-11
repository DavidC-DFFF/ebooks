// Poids stables : nombre de mots, indépendant de l’écran et de A− / A+.
const readingMath = {
  clamp(value) { return Math.min(1, Math.max(0, Number(value) || 0)); },
  total(weights, chapters) {
    const sum = weights.reduce((a, b) => a + b, 0);
    return sum ? weights.reduce((a, weight, i) => a + weight * this.clamp(chapters[i]), 0) / sum : 0;
  },
  advance(chapters, index, fraction) {
    const next = [...chapters];
    if (index >= 0 && index < next.length)
      next[index] = Math.max(this.clamp(next[index]), this.clamp(fraction));
    return next;
  },
  percent(fraction) {
    // Réserver 100 % à une lecture arrivée au bout.
    return fraction >= 1 ? 100 : Math.min(99, Math.round(this.clamp(fraction) * 100));
  }
};
