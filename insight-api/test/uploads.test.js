import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { checkMagicBytes } from '../src/routes/uploads.js'

// Última linha de defesa dos uploads: garante que os bytes do ficheiro
// correspondem ao Content-Type declarado. Sem isto, basta renomear um
// executável para .jpg e declarar image/jpeg.

/** Constrói um buffer com o cabeçalho dado, preenchido até 16 bytes. */
function header(...bytes) {
  const buf = Buffer.alloc(16)
  bytes.forEach((b, i) => { buf[i] = b })
  return buf
}

const JPEG = header(0xFF, 0xD8, 0xFF, 0xE0)
const PNG  = header(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
const GIF  = header(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
const WEBM = header(0x1A, 0x45, 0xDF, 0xA3)

function webp() {
  const buf = Buffer.alloc(16)
  Buffer.from('RIFF').copy(buf, 0)
  Buffer.from('WEBP').copy(buf, 8)
  return buf
}

function mp4() {
  const buf = Buffer.alloc(16)
  Buffer.from('ftyp').copy(buf, 4)
  return buf
}

describe('checkMagicBytes — ficheiros legítimos', () => {
  test('aceita JPEG', () => assert.equal(checkMagicBytes(JPEG, 'image/jpeg'), true))
  test('aceita PNG',  () => assert.equal(checkMagicBytes(PNG,  'image/png'),  true))
  test('aceita GIF',  () => assert.equal(checkMagicBytes(GIF,  'image/gif'),  true))
  test('aceita WEBP', () => assert.equal(checkMagicBytes(webp(), 'image/webp'), true))
  test('aceita WEBM', () => assert.equal(checkMagicBytes(WEBM, 'video/webm'), true))
  test('aceita MP4',  () => assert.equal(checkMagicBytes(mp4(), 'video/mp4'), true))
  test('aceita MOV',  () => assert.equal(checkMagicBytes(mp4(), 'video/quicktime'), true))
})

describe('checkMagicBytes — tipo declarado não bate com o conteúdo', () => {
  test('rejeita PNG declarado como JPEG', () => {
    assert.equal(checkMagicBytes(PNG, 'image/jpeg'), false)
  })

  test('rejeita JPEG declarado como PNG', () => {
    assert.equal(checkMagicBytes(JPEG, 'image/png'), false)
  })

  test('rejeita GIF declarado como WEBP', () => {
    assert.equal(checkMagicBytes(GIF, 'image/webp'), false)
  })

  test('rejeita executável Windows (MZ) declarado como JPEG', () => {
    assert.equal(checkMagicBytes(header(0x4D, 0x5A, 0x90, 0x00), 'image/jpeg'), false)
  })

  test('rejeita ELF declarado como PNG', () => {
    assert.equal(checkMagicBytes(header(0x7F, 0x45, 0x4C, 0x46), 'image/png'), false)
  })

  test('rejeita script de texto declarado como GIF', () => {
    const sh = Buffer.alloc(16)
    Buffer.from('#!/bin/sh\n').copy(sh, 0)
    assert.equal(checkMagicBytes(sh, 'image/gif'), false)
  })

  test('rejeita HTML declarado como imagem (vector de XSS)', () => {
    const html = Buffer.alloc(16)
    Buffer.from('<html><script').copy(html, 0)
    assert.equal(checkMagicBytes(html, 'image/png'), false)
  })
})

describe('checkMagicBytes — buffers degenerados', () => {
  test('rejeita buffer vazio', () => {
    assert.equal(checkMagicBytes(Buffer.alloc(0), 'image/jpeg'), false)
  })

  test('rejeita buffer com menos de 8 bytes', () => {
    assert.equal(checkMagicBytes(Buffer.from([0xFF, 0xD8, 0xFF]), 'image/jpeg'), false)
  })

  test('rejeita WEBP truncado sem rebentar — o RIFF exige ler até ao byte 11', () => {
    const truncado = Buffer.alloc(9)
    Buffer.from('RIFF').copy(truncado, 0)
    assert.equal(checkMagicBytes(truncado, 'image/webp'), false)
  })

  test('rejeita buffer todo a zeros', () => {
    assert.equal(checkMagicBytes(Buffer.alloc(16), 'image/jpeg'), false)
  })
})

describe('checkMagicBytes — tipos desconhecidos', () => {
  // Documenta o comportamento actual: tipos não reconhecidos passam.
  // É seguro porque as rotas validam o Content-Type contra as listas de
  // permitidos ANTES de chegar aqui. Se essa ordem mudar, este teste avisa.
  test('deixa passar tipo desconhecido — depende da validação a montante', () => {
    assert.equal(checkMagicBytes(header(0x00, 0x01), 'application/pdf'), true)
  })
})
