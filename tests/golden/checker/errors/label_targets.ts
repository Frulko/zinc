outer: {
  for (let i = 0; i < 3; i++) {
    if (i === 1) continue outer;
  }
}
for (let j = 0; j < 2; j++) {
  if (j === 1) break missing;
}
