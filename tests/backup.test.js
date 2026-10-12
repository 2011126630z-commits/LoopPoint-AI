import test from 'node:test'
import assert from 'node:assert/strict'
import { BACKUP_FORMAT, buildBackup, mergeBackup, parseBackup } from '../src/memory.js'

const conversation = (id, updatedAt, text = 'hello') => ({
  id,
  title: text,
  updatedAt,
  messages: [{ role: 'user', content: text }, { role: 'assistant', content: 'ok' }],
})

test('backup round-trips conversations and memories', () => {
  const payload = buildBackup(
    [conversation('a', 1000, '旧对话')],
    [{ id: 'm1', text: ' 喜欢简洁回答 ', createdAt: 5 }],
    new Date('2026-10-12T00:00:00.000Z'),
  )
  assert.equal(payload.format, BACKUP_FORMAT)
  assert.equal(payload.exportedAt, '2026-10-12T00:00:00.000Z')
  const restored = parseBackup(JSON.stringify(payload))
  assert.equal(restored.conversations[0].messages.length, 2)
  assert.equal(restored.memories[0].text, '喜欢简洁回答')
})

test('backup rejects broken or empty files', () => {
  assert.throws(() => parseBackup('not json'), /不是有效的 JSON/)
  assert.throws(() => parseBackup('null'), /内容不完整/)
  assert.throws(() => parseBackup('{"conversations":[],"memories":[]}'), /没有可导入/)
})

test('merge keeps the newest conversations and deduplicates memories', () => {
  const current = {
    conversations: [conversation('a', 1000, '旧'), conversation('b', 3000, '保留')],
    memories: [{ id: 'm1', text: '相同记忆' }],
  }
  const incoming = {
    conversations: [conversation('a', 9000, '新')],
    memories: [{ id: 'm2', text: '相同记忆' }, { id: 'm3', text: '新增记忆' }],
  }
  const merged = mergeBackup(current, incoming)
  assert.deepEqual(merged.conversations.map((entry) => entry.id), ['a', 'b'])
  assert.equal(merged.conversations[0].messages[0].content, '新')
  assert.deepEqual(merged.memories.map((item) => item.text), ['相同记忆', '新增记忆'])
})

test('merge tolerates missing or hostile input', () => {
  const merged = mergeBackup(null, { conversations: [{ id: 1, messages: 'x' }], memories: [{ text: 'ok' }] })
  assert.deepEqual(merged.conversations, [])
  assert.deepEqual(merged.memories, [])
})
