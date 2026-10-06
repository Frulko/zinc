const f = async (x: number): Promise<number> => x + 1
f(1).then((v) => { console.log(v) })
