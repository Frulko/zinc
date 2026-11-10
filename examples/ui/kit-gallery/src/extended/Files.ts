// Consumer adapter: permission and scoped picker remain explicit in the application.
import { open, OpenOptions, Filter } from 'zinc:system/dialog';
export async function browseAttachments():Promise<string[]|null> {
 const options=new OpenOptions();options.title='Add attachments';options.multiple=true;options.filters=[new Filter('Attachments',['png','jpg','jpeg','pdf','txt'])];return await open(options);
}
export async function browsePhoto():Promise<string[]|null> {
 const options=new OpenOptions();options.title='Change photo';options.filters=[new Filter('Images',['png','jpg','jpeg','bmp','gif','webp'])];return await open(options);
}
