import { 'SCREEN_W' as width } from 'zinc:platform';
class JavaScriptOnly { static { this.value = width; } }
console.log(JavaScriptOnly.value > 0);
