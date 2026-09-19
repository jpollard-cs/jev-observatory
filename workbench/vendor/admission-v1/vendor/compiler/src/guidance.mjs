import { clone, insist, jsonHash, jsonValue, sha256 } from './core.mjs';

/** Lossless structural decomposition, not an LLM summary or inferred executable policy. */
export function decomposeGuidance(value) {
  jsonValue(value);
  if (typeof value !== 'string') {
    insist(value !== null && typeof value === 'object' && !Array.isArray(value), 'guide_string_or_object_required');
    const blocks = Object.entries(value).map(([key,content], i) => ({
      id: `g${String(i+1).padStart(3,'0')}`, heading: key,
      source: { pointer: `/state/classifierGuide/${key.replaceAll('~','~0').replaceAll('/','~1')}` },
      content: clone(content), contentHash: jsonHash(content), sourceKey: key,
    }));
    return { format: 'ordered-object', sourceHash: jsonHash(value), blocks };
  }
  const lines = value.split(/(?<=\n)/);
  const starts = []; let offset = 0, fence = null;
  for (let i=0;i<lines.length;i++) {
    const line = lines[i]; const fm = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fm) { if (!fence) fence = fm[1]; else if(fm[1][0]===fence[0] && fm[1].length >= fence.length) fence = null; }
    if (!fence && /^#{1,3} /.test(line)) starts.push({ offset, line:i+1, heading:line.replace(/^#+ /,'').trim() });
    offset += line.length;
  }
  if (!starts.length || starts[0].offset !== 0) starts.unshift({ offset:0, line:1, heading:'Preamble' });
  const blocks = starts.map((start,i) => {
    const end = starts[i+1]?.offset ?? value.length;
    const content = value.slice(start.offset,end);
    return { id:`g${String(i+1).padStart(3,'0')}`, heading:start.heading,
      source:{ pointer:'/state/classifierGuide', startUtf16:start.offset, endUtf16:end, startLine:start.line,
        endLine:start.line + (content.match(/\n/g)?.length ?? 0) - (content.endsWith('\n') ? 1 : 0) },
      content, contentHash:jsonHash(content) };
  });
  return { format:'markdown', sourceHash:sha256(value), blocks };
}
export function assembleGuidance(guide, blocks = guide.blocks) {
  return guide.format === 'markdown' ? blocks.map(b=>b.content).join('') : Object.fromEntries(blocks.map(b=>[b.sourceKey,clone(b.content)]));
}
export function validateGuidance(guide) {
  insist(['markdown','ordered-object'].includes(guide.format), 'unknown_guide_format');
  insist(Array.isArray(guide.blocks) && guide.blocks.length>0, 'empty_guide');
  insist(new Set(guide.blocks.map(b=>b.id)).size===guide.blocks.length, 'duplicate_guide_block');
  for (const block of guide.blocks) {
    insist(jsonHash(block.content)===block.contentHash, 'guide_block_hash_mismatch',{block:block.id});
    if(guide.format==='markdown') insist(typeof block.content==='string','markdown_block_not_text');
  }
  const value=assembleGuidance(guide);
  insist((typeof value==='string'?sha256(value):jsonHash(value))===guide.sourceHash,'guide_reassembly_hash_mismatch');
}
