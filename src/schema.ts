// MCP inputSchema (JSON Schema) -> AI Studio function declaration parameters.
//
// AI Studio's declaration editor accepts only Gemini's OpenAPI subset and rejects,
// among others, `additionalProperties` and `anyOf` without a `type`. Anything we
// cannot translate faithfully throws with the path, so a tool is reported as
// unusable instead of being declared with a silently different schema.

const DROP = new Set(['$schema', 'additionalProperties', 'title', '$id', '$comment']);

type Json = Record<string, unknown>;

export function toGemini(schema: unknown, path: string): unknown {
  if (Array.isArray(schema)) return schema.map((s, i) => toGemini(s, `${path}[${i}]`));
  if (!schema || typeof schema !== 'object') return schema;
  const s = schema as Json;

  if (s.anyOf || s.oneOf) {
    const variants = (s.anyOf ?? s.oneOf) as Json[];
    const { anyOf: _a, oneOf: _o, ...others } = s;
    // "X or a list of X" -> list of X; a server that accepts both accepts the list.
    if (variants.length === 2) {
      const [a, b] = variants;
      const list = b?.type === 'array' ? b : a?.type === 'array' ? a : null;
      const single = list === b ? a : b;
      if (list && JSON.stringify(list.items) === JSON.stringify(single)) {
        return toGemini({ ...others, ...list }, path);
      }
    }
    // "X or null" -> X, marked nullable.
    const nonNull = variants.filter(v => v?.type !== 'null');
    if (nonNull.length === 1 && variants.length === 2) {
      return toGemini({ ...others, ...nonNull[0], nullable: true }, path);
    }
    throw new Error(`${path}: 不支持的 anyOf 写法 ${JSON.stringify(variants).slice(0, 160)}`);
  }

  if (Array.isArray(s.type)) {
    const types = (s.type as string[]).filter(t => t !== 'null');
    if (types.length !== 1) throw new Error(`${path}: 不支持多类型 ${JSON.stringify(s.type)}`);
    return toGemini({ ...s, type: types[0], nullable: true }, path);
  }

  if ('$ref' in s) throw new Error(`${path}: 不支持 $ref`);
  if ('const' in s) {
    const { const: c, ...rest } = s;
    return toGemini({ ...rest, enum: [c] }, path);
  }

  const out: Json = {};
  for (const [k, v] of Object.entries(s)) {
    if (DROP.has(k)) continue;
    if (k === 'exclusiveMinimum' || k === 'exclusiveMaximum') {
      if (s.type !== 'integer') throw new Error(`${path}: ${k} 只支持整数`);
      if (k === 'exclusiveMinimum') out.minimum = (v as number) + 1;
      else out.maximum = (v as number) - 1;
      continue;
    }
    if (k === 'default') {
      // Not accepted by the editor; keep the information in the description instead.
      const note = `默认 ${JSON.stringify(v)}`;
      out.description = s.description ? `${s.description}（${note}）` : note;
      continue;
    }
    if (k === 'description' && 'default' in s) continue; // written together with default above
    if (k === 'properties') {
      out.properties = Object.fromEntries(
        Object.entries(v as Json).map(([pk, pv]) => [pk, toGemini(pv, `${path}.${pk}`)]),
      );
      continue;
    }
    out[k] = toGemini(v, `${path}.${k}`);
  }
  if (out.type === 'object' && !out.properties) out.properties = {};
  return out;
}
