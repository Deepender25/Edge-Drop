import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STORE_STARTUP_TASK_ID } from '../electron/main/config'

const exec = vi.hoisted(() => ({
  calls: [] as Array<{ file: string; args: string[]; opts: Record<string, unknown> }>,
  stdout: '2\r\n',
  fail: false
}))

vi.mock('electron', () => ({
  app: {
    getAppPath: () => join(__dirname, '..'),
    isPackaged: true,
    getPath: () => 'C:\\mock\\userData'
  }
}))

vi.mock('node:child_process', () => ({
  execFile: (file: string, args: string[], opts: unknown, cb?: Function) => {
    const callback = typeof opts === 'function' ? opts : cb
    const options = typeof opts === 'function' ? {} : (opts as Record<string, unknown>)
    exec.calls.push({ file, args, opts: options })
    if (exec.fail) {
      callback?.(Object.assign(new Error('helper failed'), { stdout: '', stderr: 'ERR' }), '', 'ERR')
      return
    }
    callback?.(null, exec.stdout, '')
  }
}))

import { disable, enable, getStatus, parseStartupHelperState } from '../electron/main/storeStartup'

const helperPath = join(__dirname, '..', 'resources', 'startup', 'EdgeDropStartup.exe')

describe('Store StartupTask (getStatus / enable / disable)', () => {
  beforeEach(() => {
    exec.calls = []
    exec.stdout = '2\r\n'
    exec.fail = false
  })

  it('helper exists as a Windows GUI process', () => {
    expect(existsSync(helperPath)).toBe(true)
    const buf = readFileSync(helperPath)
    const pe = buf.readUInt32LE(0x3c)
    expect(buf.readUInt16LE(pe + 24 + 68)).toBe(2)
  })

  it('parses the helper state line', () => {
    expect(parseStartupHelperState('2\r\n')).toBe(2)
    expect(parseStartupHelperState('0')).toBe(0)
    expect(parseStartupHelperState('1\n')).toBe(1)
    expect(parseStartupHelperState('ERR')).toBeNull()
  })

  it('enable / disable / getStatus launch the helper hidden with the manifest TaskId', async () => {
    await enable()
    await disable()
    exec.stdout = '0\n'
    await getStatus()
    expect(exec.calls.map((c) => c.args)).toEqual([
      ['enable', STORE_STARTUP_TASK_ID],
      ['disable', STORE_STARTUP_TASK_ID],
      ['get', STORE_STARTUP_TASK_ID]
    ])
    for (const call of exec.calls) {
      expect(call.file).toBe(helperPath)
      expect(call.opts.windowsHide).toBe(true)
      expect(call.file).not.toMatch(/powershell/i)
      expect(call.args.join(' ')).not.toMatch(/Invoke-CommandInDesktopPackage/)
    }
  })

  it('returns null when the helper fails so On is not faked', async () => {
    exec.fail = true
    expect(await enable()).toBeNull()
  })
})
