import { spawn, ChildProcess } from 'node:child_process'

export function getSystemPowerShellPath(): string {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  return `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
}

class PersistentPowerShell {
  private proc: ChildProcess | null = null
  private queue: { command: string; resolve: () => void; reject: (err: Error) => void }[] = []
  private running = false
  private outputBuffer = ''
  private powershellPath: string

  constructor() {
    this.powershellPath = getSystemPowerShellPath()
    if (process.platform === 'win32') {
      this.init()
    }
  }

  private init() {
    try {
      this.proc = spawn(this.powershellPath, ['-NoProfile', '-NonInteractive', '-Command', '-'], {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true
      })

      this.proc.stdout?.on('data', (data) => {
        this.outputBuffer += data.toString()
        if (this.outputBuffer.includes('__CLIPBOARD_DONE__')) {
          this.outputBuffer = ''
          this.onCommandFinished(null)
        }
      })

      this.proc.on('close', () => {
        this.proc = null
        this.running = false
        // Re-init after a short delay if closed unexpectedly
        setTimeout(() => {
          if (process.platform === 'win32') {
            this.init()
          }
        }, 1000)
      })

      this.proc.on('error', (err) => {
        console.error('[PersistentPowerShell] error:', err)
        this.running = false
      })
    } catch (err) {
      console.error('[PersistentPowerShell] spawn failed:', err)
    }
  }

  private onCommandFinished(err: Error | null) {
    const active = this.queue.shift()
    if (active) {
      if (err) active.reject(err)
      else active.resolve()
    }
    this.running = false
    this.processQueue()
  }

  public run(script: string, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ command: script, resolve, reject })
      this.processQueue()

      // Fallback timeout to prevent hanging the app if powershell hangs
      setTimeout(() => {
        const idx = this.queue.findIndex(q => q.command === script)
        if (idx !== -1) {
          const removed = this.queue.splice(idx, 1)[0]
          removed.reject(new Error('TIMEOUT'))
          this.running = false
          // Restart powershell process if it timed out to ensure it's not in a bad state
          if (this.proc) {
            this.proc.kill()
            this.proc = null
          }
          this.processQueue()
        }
      }, timeoutMs)
    })
  }

  private processQueue() {
    if (this.running || !this.proc || this.queue.length === 0) return
    this.running = true
    const active = this.queue[0]
    
    try {
      const fullCmd = `${active.command}; Write-Host "__CLIPBOARD_DONE__"\n`
      this.proc.stdin?.write(fullCmd, 'utf8')
    } catch (err) {
      this.onCommandFinished(err as Error)
    }
  }

  public dispose() {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
  }
}

export const psHost = new PersistentPowerShell()
