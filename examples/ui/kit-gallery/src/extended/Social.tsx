import { Comments, CommentItem, Presence, CardStack, heading, theme } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
export function ExtendedSocial(): i32 {
  const [notice, setNotice] = createSignal('Select a person or reply'), [index, setIndex] = createSignal<i32>(0), [comments, setComments] = createSignal<CommentItem[]>([
    {id:'maya',author:'Maya Okafor',text:'The release candidate is ready. The quiet layout gives the content room.',time:'12 min ago',badge:'Maintainer',likes:3,liked:false},
    {id:'jonas',author:'Jonas Berg',text:'The signature and file selection stay local. I will check the small window next.',time:'8 min ago',depth:1,likes:1,edited:true}
  ]);
  const like = (id: string): void => setComments(comments().map((item: CommentItem): CommentItem => item.id === id ? { ...item, liked: item.liked !== true, likes: (item.likes ?? 0) + (item.liked === true ? -1 : 1) } : item));
  return <View className="flex-col gap-5 min-w-0"><Text className={heading(4)}>People and cards</Text>
    <Presence people={[{id:'maya',name:'Maya Okafor',status:'online'},{id:'jonas',name:'Jonas Berg',status:'away'},{id:'priya',name:'Priya Nair',status:'online'},{id:'tomas',name:'Tomas Rivera',status:'offline'},{id:'lee',name:'Lee Chen'}]} maxVisible={3} onPerson={(id:string)=>setNotice('Selected '+id)} onOverflow={()=>setNotice('Also present: Tomas Rivera and Lee Chen')}/>
    <Comments items={comments()} onLike={like} onReply={(id:string)=>setNotice('Reply to '+id)}/><Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{notice()}</Text>
    <CardStack cards={[{id:'release',title:'Release 2.4',description:'Signed builds for all platforms'},{id:'design',title:'Quiet details',description:'Keyboard focus and one accent'},{id:'review',title:'Ready for review',description:'Browse with arrow keys or flick the card'}]} index={index} onChange={(at:i32,direction:string)=>setIndex(at)} onOpen={(id:string)=>setNotice('Opened '+id)} height={165}/>
  </View>;
}
