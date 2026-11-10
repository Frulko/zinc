export enum Folder { Inbox, Starred, Sent, Archive }
export const folders: string[] = ['Inbox', 'Starred', 'Sent', 'Archive'];
export interface Message {
  id: string; name: string; from: string; to: string; subject: string; body: string;
  date: string; folder: Folder; unread: boolean; starred: boolean;
}
export function sampleMessages(): Message[] {
  return [
    { id: 'mail-1', name: 'Maya Laurent', from: 'maya@example.com', to: 'alex@example.com', subject: 'Saturday at the print studio', date: '10:24', folder: Folder.Inbox, unread: false, starred: true, body: 'Hi Alex,\n\nThe studio is ours from ten on Saturday. I have set aside the indigo ink and a stack of recycled paper for the workshop.\n\nCould you bring the small test prints? We can pin them up before everyone arrives. There will be coffee in the kitchen.\n\nSee you there,\nMaya' },
    { id: 'mail-2', name: 'Noah Chen', from: 'noah@example.com', to: 'alex@example.com', subject: 'A quieter route to the coast', date: '09:10', folder: Folder.Inbox, unread: true, starred: false, body: 'Hi Alex,\n\nI tried the path along the old railway yesterday. It is almost flat, and there is a little bakery halfway to the coast.\n\nShall we meet at the bridge at nine next Sunday? Bring a light jacket; the last stretch gets windy.\n\nNoah' },
    { id: 'mail-3', name: 'Lena Ortiz', from: 'lena@example.com', to: 'alex@example.com', subject: 'Notes from the garden meeting', date: 'Yesterday', folder: Folder.Inbox, unread: true, starred: false, body: 'Hello everyone,\n\nWe agreed to plant the herbs near the south wall. The watering rota starts next week, with two people each evening.\n\nI will label the seedlings on Thursday. If you have spare pots, please leave them in the shed.\n\nThanks,\nLena' },
    { id: 'mail-4', name: 'Theo Martin', from: 'theo@example.com', to: 'alex@example.com', subject: 'Your shelf is ready', date: 'Monday', folder: Folder.Inbox, unread: false, starred: false, body: 'Hi Alex,\n\nThe oak shelf is sanded and ready for its first coat of oil. The offcuts made a useful little tray too.\n\nYou can collect both after six tomorrow.\n\nTheo' },
    { id: 'mail-5', name: 'Alex Morgan', from: 'alex@example.com', to: 'maya@example.com', subject: 'Workshop materials', date: 'Monday', folder: Folder.Sent, unread: false, starred: false, body: 'Hi Maya,\n\nI have packed the rollers and the small test prints. Looking forward to trying the indigo ink.\n\nAlex' },
    { id: 'mail-6', name: 'Iris Bell', from: 'iris@example.com', to: 'alex@example.com', subject: 'The reading list', date: 'Last week', folder: Folder.Archive, unread: false, starred: true, body: 'Hi Alex,\n\nHere are the three books we talked about: Ways of Seeing, The Living Mountain, and A Pattern Language.\n\nThe library has all three. I would start with the mountain.\n\nIris' },
  ];
}
