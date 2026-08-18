// Official Windows.ApplicationModel.StartupTask caller.
// Windows GUI process (no console). Must live inside the AppX.
using System;
using System.Runtime.InteropServices;
using System.Threading;
using Windows.ApplicationModel;
using Windows.Foundation;

internal static class Program
{
    private const uint PM_REMOVE = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int ptX;
        public int ptY;
    }

    [DllImport("user32.dll")]
    private static extern bool PeekMessage(out MSG lpMsg, IntPtr hWnd, uint min, uint max, uint remove);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string action = args.Length > 0 ? args[0].Trim().ToLowerInvariant() : "get";
            string taskId = args.Length > 1 ? args[1] : "EdgeDropStartup";

            StartupTask task = Wait(StartupTask.GetAsync(taskId));

            if (action == "enable")
            {
                WriteState((int)Wait(task.RequestEnableAsync()));
                return 0;
            }

            if (action == "disable")
            {
                task.Disable();
            }

            WriteState((int)task.State);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("ERR " + ex.GetType().Name + " " + ex.Message);
            return 21;
        }
    }

    private static void WriteState(int state)
    {
        Console.Out.WriteLine(state.ToString());
        Console.Out.Flush();
    }

    private static void Pump()
    {
        MSG msg;
        while (PeekMessage(out msg, IntPtr.Zero, 0, 0, PM_REMOVE))
        {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
    }

    private static T Wait<T>(IAsyncOperation<T> op)
    {
        if (op.Status == AsyncStatus.Started)
        {
            using (ManualResetEvent ev = new ManualResetEvent(false))
            {
                op.Completed = delegate { try { ev.Set(); } catch { } };
                DateTime deadline = DateTime.UtcNow.AddSeconds(20);
                while (op.Status == AsyncStatus.Started)
                {
                    Pump();
                    if (ev.WaitOne(20)) break;
                    if (DateTime.UtcNow > deadline)
                    {
                        throw new TimeoutException("StartupTask async timeout");
                    }
                }
            }
        }

        if (op.Status != AsyncStatus.Completed)
        {
            throw new InvalidOperationException("async-status-" + op.Status + "-" + op.ErrorCode);
        }

        return op.GetResults();
    }
}
