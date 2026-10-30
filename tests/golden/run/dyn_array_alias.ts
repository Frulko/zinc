// An any[] taken out of `any` (or put into it) is the same array, as in JavaScript: a push through either is seen by the other (ZN-890)
const guilds: any[] = [{ roles: [{ id: 'a' }] }];
const roles: any[] = guilds[0].roles;
roles.push({ id: 'b' });
console.log(JSON.stringify(guilds[0].roles), guilds[0].roles === roles);
const o: any = { list: [1] };
const list: any[] = [];
o.list = list;
list.push(2);
o.list[1] = 3;
console.log(JSON.stringify(o.list), list.length, o.list === list);
