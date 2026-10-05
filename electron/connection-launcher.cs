using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Reflection;

[assembly: AssemblyTitle("开黑搭子连接启动器")]
[assembly: AssemblyDescription("通过 Windows 系统授权启动本机客户端连接进程")]
[assembly: AssemblyVersion("0.5.0.0")]
internal static class ConnectionLauncher {
    // Windows passes a command line, rather than argv, to the child process.
    internal static string Quote(string value) {
        var text = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            text.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
            text.Append(c); slashes = 0;
        }
        text.Append('\\', slashes * 2); return text.Append('"').ToString();
    }
    private static void Record(string file, string phase, int pid, int error) {
        try { File.WriteAllText(file, "{\"phase\":\"" + phase + "\",\"pid\":" + pid + ",\"nativeCode\":" + error + "}", new UTF8Encoding(false)); } catch { }
    }
    [STAThread]
    private static int Main(string[] args) {
        try { return Launch(args); } catch { return 2; }
    }
    private static int Launch(string[] args) {
        // Paths only: connection credentials are never arguments or launch records.
        if (args.Length != 4) return 2;
        string bundle = Path.GetFullPath(args[0]), data = Path.GetFullPath(args[1]);
        string session = Path.GetFullPath(args[2]), record = Path.GetFullPath(args[3]);
        if (Path.GetDirectoryName(session) != data || Path.GetDirectoryName(record) != data ||
            !System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(session), "^client-session-[a-f0-9]{32}\\.json$") ||
            Path.GetFileName(record) != Path.GetFileName(session).Replace("client-session-", "client-launch-")) return 2;
        string runtime = Path.Combine(bundle, "node.exe");
        string entry = Path.Combine(bundle, "electron", "client-helper-entry.mjs");
        if (!File.Exists(runtime) || !File.Exists(entry) || !File.Exists(session)) return 2;
        try {
            Record(record, "requesting", 0, 0);
            var info = new ProcessStartInfo(runtime) {
                Arguments = Quote(entry) + " " + Quote("--buddy-bundle=" + bundle) + " " + Quote("--buddy-data=" + data) + " " + Quote("--lcu-helper=" + session),
                WorkingDirectory = bundle, UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden
            };
            using (var process = Process.Start(info)) { Record(record, "launched", process.Id, 0); }
            return 0;
        } catch (Win32Exception error) { Record(record, "failed", 0, error.NativeErrorCode); return 1; }
          catch { Record(record, "failed", 0, -1); return 1; }
    }
}
