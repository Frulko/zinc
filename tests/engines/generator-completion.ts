function* cancelled(): Generator<number> { for(let i=0;i<1;i++){ try {yield 1;}finally {yield 2;continue;} } }
const c=cancelled(); console.log(c.next(),c.return(99),c.next());
function* interrupted(): Generator<number> { try{return 10;}finally{yield 1;yield 2;} }
const x=interrupted();console.log(x.next(),x.return(20),x.next());
function* finalThrow(): Generator<number> { try {yield 1;}finally{yield 2;throw new Error('replacement');} }
const y=finalThrow();console.log(y.next(),y.return(30));try{y.next();}catch(e){console.log(e.message);}
