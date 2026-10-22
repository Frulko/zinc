import { createEffect, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { setClipboardText } from 'zinc:gfx';
import { Markdown } from '../../../../lib/std/markdown-view';
import { parse as parseMarkdown } from '../../../../lib/std/markdown';
import { Icon } from 'zinc:icons';
import { selected, selectedId, detail, detailError, closeTask, moveTask, declaredState, openTask,
  editing, beginEdit, cancelEdit, editTitle, setEditTitle, editDescription, setEditDescription, commentDraft, setCommentDraft, saveEdits, postComment, saving, writeError } from '../state';
import { assignment, Criterion, Comment } from '../models';
import { STATUSES, COLUMN_NAMES } from '../constants';
import { writable } from '../services/backlog';

function Section(props: { title: string; body: string }): i32 {
  return <View className="flex-col gap-3"><Text className="text-[11px] font-semibold text-[#8a96a5]">{props.title}</Text><Markdown blocks={parseMarkdown(props.body)} small={false} /></View>;
}
function dependencies(): string[] { const d = detail(); return d !== null ? d.dependencies : []; }
export function TaskModal(): i32 {
  const screen = createNodeRef(), panel = createNodeRef(), editor = createNodeRef();
  const node = <View ref={screen} className="absolute inset-0 items-center justify-center" hidden={selectedId() === '' ? 1 : 0} role="dialog" aria-label="Détail de la tâche">
    <View ref={panel} className="w-[1120] max-w-[96vw] h-[88vh] flex-col rounded-[8] overflow-hidden bg-[#ffffff] border border-[#dce1e7] shadow-lg">
      <View className="flex-row h-[44] shrink-0 items-center gap-2 px-4 border-b border-[#e5e8ed] bg-[#f8f9fb]">
        <Text className="text-[12px] font-mono text-[#7b8899] grow">{selectedId()}</Text>
        {!editing() && <Button onClick={beginEdit} disabled={detail() === null || saving()} className="flex-row h-[36] px-3 items-center gap-2 rounded-[5] bg-transparent hover:bg-[#e9edf2]"><Icon name="pencil" size={14} color={() => 0x6b7c90} /><Text className="text-[12px] text-[#526579]">Modifier</Text></Button>}
        {editing() && <View className="flex-row gap-2">
          <Button onClick={cancelEdit} disabled={saving()} className="h-[36] px-3 rounded-[5] bg-transparent hover:bg-[#e9edf2]"><Text className="text-[12px] text-[#637286]">Annuler</Text></Button>
          <Button onClick={() => { saveEdits(); }} disabled={saving()} className="h-[32] px-3 rounded-[5] bg-[#4e739b]"><Text className="text-[12px] text-[#ffffff]">{saving() ? 'Enregistrement…' : 'Enregistrer'}</Text></Button>
        </View>}
        <Button onClick={() => setClipboardText(selectedId())} aria-label="Copier l’identifiant" className="h-[36] w-[36] items-center justify-center rounded-[5] bg-transparent hover:bg-[#e9edf2]"><Icon name="copy" size={14} color={() => 0x6b7c90} /></Button>
        <Button onClick={closeTask} disabled={saving()} aria-label="Fermer le détail" className="h-[36] w-[36] items-center justify-center rounded-[5] bg-transparent hover:bg-[#e9edf2]"><Icon name="x" size={16} color={() => 0x6b7c90} /></Button>
      </View>
      {writeError() !== '' && <View className="px-5 py-2 bg-[#fff0e7]"><Text className="text-[12px] text-[#a25e3c]">{writeError()}</Text></View>}
      <View className="flex-row grow min-h-0">
        <View className="flex-col grow basis-0 min-w-0">
          {editing() && <View className="flex-col grow min-h-0 p-5 gap-3">
            <Text className="text-[11px] text-[#8a96a5]">TITRE</Text>
            <Input value={editTitle()} onInput={setEditTitle} aria-label="Titre de la tâche" disabled={saving()} className="h-[38] px-2 text-[16px] font-semibold border border-[#dce1e7] rounded-[5] bg-[#ffffff] text-[#364353]" />
            <Text className="text-[11px] text-[#8a96a5]">DESCRIPTION · MARKDOWN</Text>
            <TextArea ref={editor} value={editDescription()} onInput={setEditDescription} aria-label="Description Markdown" disabled={saving()} rows={0} className="grow min-h-0 px-3 py-2 text-[13px] leading-[20] font-mono border border-[#dce1e7] rounded-[5] bg-[#fafbfc] text-[#46566a]" />
            <Text className="text-[11px] text-[#8a96a5]">{writable() ? 'Enregistrer écrit le titre et la description dans Backlog.md.' : 'Instantané en lecture seule · brouillon conservé dans cette session.'}</Text>
          </View>}
          {!editing() && <ScrollView className="grow min-h-0 flex-col p-6 gap-5">
            <Text className="text-[21px] font-semibold leading-[28] text-[#354253]">{selected()?.title ?? ''}</Text>
            {detail() === null && <Text className="text-[13px] text-[#8a96a5]">{detailError() !== '' ? detailError() : 'Chargement…'}</Text>}
            {detail() !== null && <View className="flex-col gap-5">
              <Section title="DESCRIPTION" body={detail()!.description !== '' ? detail()!.description : 'Aucune description.'} />
              <View className="flex-col gap-3"><Text className="text-[11px] font-semibold text-[#8a96a5]">CRITÈRES D’ACCEPTATION</Text>
                {detail()!.criteria.map((c: Criterion) => <View className="flex-row items-start gap-2"><Icon name={c.checked ? 'square-check' : 'square'} size={16} color={() => c.checked ? 0x648e72 : 0xb0bac6} /><View className="grow basis-0 min-w-0"><Markdown blocks={parseMarkdown(c.text)} small={false} /></View></View>)}
              </View>
              {detail()!.plan !== '' && <Section title="PLAN" body={detail()!.plan} />}
              {detail()!.notes !== '' && <Section title="NOTES D’IMPLÉMENTATION" body={detail()!.notes} />}
              {detail()!.summary !== '' && <Section title="RÉSULTAT" body={detail()!.summary} />}
              <Text className="text-[11px] font-semibold text-[#8a96a5]">COMMENTAIRES</Text>
              {detail()!.comments.length === 0 && <Text className="text-[13px] text-[#9ba5b1]">Aucun commentaire.</Text>}
              {detail()!.comments.map((c: Comment) => <View className="flex-col gap-2 p-3 bg-[#f5f7fa] rounded-[5]">
                <Text className="text-[11px] text-[#7e8c9d]">{c.author + ' · ' + c.created.replace('T', ' ').replace('Z', ' UTC')}</Text><Markdown blocks={parseMarkdown(c.body)} small={false} />
              </View>)}
            </View>}
          </ScrollView>}
          <View className="flex-col shrink-0 p-3 gap-2 border-t border-[#e5e8ed] bg-[#fbfcfd]">
            <TextArea value={commentDraft()} onInput={setCommentDraft} aria-label="Nouveau commentaire" placeholder="Ajouter un commentaire… (Markdown accepté)" disabled={saving()} rows={2} className="h-[58] text-[12px] px-2 py-1 bg-[#ffffff] border border-[#dce1e7] rounded-[5] text-[#46566a]" />
            <View className="flex-row items-center gap-3"><Text className="grow text-[10px] text-[#9ba5b1]">{writable() ? 'Commentaire enregistré dans la tâche' : 'Instantané en lecture seule'}</Text><Button onClick={() => { postComment(); }} disabled={saving() || commentDraft().trim() === ''} className="h-[32] px-3 rounded-[5] bg-[#4e739b] disabled:opacity-40"><Text className="text-[12px] text-[#ffffff]">{saving() ? 'Enregistrement…' : 'Commenter'}</Text></Button></View>
          </View>
        </View>
        <ScrollView className="w-[244] shrink-0 flex-col p-4 gap-4 border-l border-[#e5e8ed] bg-[#f8f9fb]">
          <Text className="text-[11px] font-semibold text-[#8a96a5]">STATUT DU TABLEAU</Text>
          <View className="flex-col gap-1">{STATUSES.map((status: string, i: i32) => <Button onClick={() => { if (selected()?.status !== status) moveTask(selectedId(), status); }} className={`h-[36] px-3 rounded-[5] ${selected()?.status === status ? 'bg-[#dfe8f2]' : 'bg-transparent hover:bg-[#e9edf2]'}`}><Text className={`text-[12px] ${selected()?.status === status ? 'text-[#416589]' : 'text-[#8290a1]'}`}>{COLUMN_NAMES[i]}</Text></Button>)}</View>
          <Text className="text-[10px] text-[#9ba5b1]">Déplacements locaux · réinitialisables</Text>
          <Text className="text-[11px] font-semibold text-[#8a96a5]">ASSIGNATION SOURCE</Text>
          <Text className="text-[12px] text-[#62778f]">{selected() !== null ? assignment(selected()!) : ''}</Text>
          <Text className="text-[11px] text-[#9ba5b1]">{declaredState(selectedId())}</Text>
          <Text className="text-[11px] font-semibold text-[#8a96a5]">JALON</Text><Text className="text-[12px] text-[#62778f]">{selected()?.milestone ?? ''}</Text>
          <Text className="text-[11px] font-semibold text-[#8a96a5]">DÉPENDANCES</Text>
          {dependencies().map((id: string) => <Button onClick={() => openTask(id)} className="h-[32] px-2 rounded-[5] bg-transparent hover:bg-[#e9edf2]"><Text className="text-[12px] text-[#527eaa]">{id}</Text></Button>)}
          {selected() !== null && selected()!.parent !== '' && <Button onClick={() => openTask(selected()!.parent)} className="h-[32] px-2 rounded-[5] bg-transparent hover:bg-[#e9edf2]"><Text className="text-[12px] text-[#527eaa]">{'Parent · ' + selected()!.parent}</Text></Button>}
          <Text className="text-[10px] text-[#a4adb8]">{detail()?.path ?? ''}</Text>
        </ScrollView>
      </View>
    </View>
  </View>;
  ui.openLayer(screen.node, { priority: 200, modal: true, backdrop: 0x101720, backdropAlpha: 110, motion: 'scale' });
  ui.focusScope(screen.node, { trap: true, restore: true, autoFocus: true }); ui.onDismiss(screen.node, closeTask);
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => closeTask());
  createEffect(() => {
    const id = selectedId(), active = editing();
    if (id !== '' && active) queueMicrotask(() => {
      // Wait for the conditional field to mount and the opening pointer press to finish.
      if (selectedId() === id && editing()) ui.focusNode(editor.node);
    });
  });
  return node;
}
