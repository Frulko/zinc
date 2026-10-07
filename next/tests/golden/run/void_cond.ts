let open = false
function openF(): void { open = true }
function closeF(): void { open = false }
const f = (): void => open ? closeF() : openF()
f(); f()
console.log(open)
const g: () => void = () => open ? closeF() : openF()
g()
console.log(open)
