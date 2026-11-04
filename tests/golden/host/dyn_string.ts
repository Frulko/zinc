const values = JSON.parse('["hello",42,true,false,null,[1,null,"x"],{"a":1}]');
for (const value of values) console.log(String(value));
console.log(String(values.missing));
