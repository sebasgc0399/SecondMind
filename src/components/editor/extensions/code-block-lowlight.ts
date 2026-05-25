import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import go from 'highlight.js/lib/languages/go';
import haskell from 'highlight.js/lib/languages/haskell';
import xml from 'highlight.js/lib/languages/xml';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lua from 'highlight.js/lib/languages/lua';
import matlab from 'highlight.js/lib/languages/matlab';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import CodeBlockNodeView from '@/components/editor/nodeviews/CodeBlockNodeView';

const lowlight = createLowlight();

// Registro explícito de plaintext: sin registro, lowlight cae a highlightAuto()
// cuando recibe un id desconocido — el user que elige "Plain text" en el
// dropdown no esperaría auto-detection. Con registro: grammar vacío → texto
// plano sin spans + roundtrip markdown ```text/```txt funciona vía aliases.
lowlight.register('bash', bash);
lowlight.register('c', c);
lowlight.register('cpp', cpp);
lowlight.register('csharp', csharp);
lowlight.register('css', css);
lowlight.register('dart', dart);
lowlight.register('go', go);
lowlight.register('haskell', haskell);
lowlight.register('xml', xml);
lowlight.register('java', java);
lowlight.register('javascript', javascript);
lowlight.register('json', json);
lowlight.register('kotlin', kotlin);
lowlight.register('lua', lua);
lowlight.register('matlab', matlab);
lowlight.register('php', php);
lowlight.register('plaintext', plaintext);
lowlight.register('powershell', powershell);
lowlight.register('python', python);
lowlight.register('ruby', ruby);
lowlight.register('rust', rust);
lowlight.register('scala', scala);
lowlight.register('sql', sql);
lowlight.register('swift', swift);
lowlight.register('typescript', typescript);

export default CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
}).configure({
  lowlight,
  defaultLanguage: null,
});
