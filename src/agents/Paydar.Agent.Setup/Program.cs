using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

ApplicationConfiguration.Initialize();
Application.Run(new SetupForm());

internal sealed class SetupForm : Form
{
    private readonly TextBox _server = new() { Width = 380 };
    private readonly TextBox _thumbprint = new() { Width = 380 };
    private readonly Button _install = new() { Text = "نصب پایدار", Width = 170, Height = 36 };
    public SetupForm()
    {
        Text = "Paydar Agent Installer (Preview)";
        Width = 490; Height = 270;
        StartPosition = FormStartPosition.CenterScreen;
        RightToLeft = RightToLeft.Yes;
        RightToLeftLayout = true;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        var panel = new TableLayoutPanel {
            Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(14)
        };
        panel.Controls.Add(new Label { Text = "آدرس HTTPS سرور Agent Gateway", Dock = DockStyle.Fill });
        panel.Controls.Add(_server);
        panel.Controls.Add(new Label { Text = "Thumbprint گواهی کلاینت (اختیاری؛ قابل تنظیم بعداً)", Dock = DockStyle.Fill });
        panel.Controls.Add(_thumbprint);
        _install.Click += async (_, _) => await InstallAsync();
        panel.Controls.Add(_install);
        Controls.Add(panel);
    }
    private async Task InstallAsync()
    {
        if (!Uri.TryCreate(_server.Text, UriKind.Absolute, out var url) ||
            url.Scheme != Uri.UriSchemeHttps || url.UserInfo.Length != 0)
        {
            MessageBox.Show("آدرس معتبر HTTPS لازم است.", "پایدار");
            return;
        }
        _install.Enabled = false;
        var staging = Path.Combine(Path.GetTempPath(), "paydar-setup-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(staging);
            using var source = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("Paydar.Agent.Setup.Payload") ??
                throw new InvalidDataException("The setup payload is missing.");
            var zip = Path.Combine(staging, "package.zip");
            using (var file = File.Create(zip)) await source.CopyToAsync(file);
            ZipFile.ExtractToDirectory(zip, staging, overwriteFiles: true);
            var script = Path.Combine(staging, "Install-PaydarAgent.ps1");
            var psi = new ProcessStartInfo("powershell.exe") {
                UseShellExecute = false, CreateNoWindow = true
            };
            foreach (var arg in new [] { "-NoProfile", "-NonInteractive", "-File", script,
                "-PackagePath", staging, "-ServerUrl", _server.Text.Trim().TrimEnd('/'),
                "-ClientCertificateThumbprint", _thumbprint.Text.Trim().Replace(" ", "") })
                psi.ArgumentList.Add(arg);
            using var process = Process.Start(psi) ?? throw new InvalidOperationException("Installer process failed");
            await process.WaitForExitAsync();
            if (process.ExitCode != 0) throw new InvalidOperationException("Install script exited with code " + process.ExitCode);
            MessageBox.Show("سرویس پایدار نصب شد. اتصال نیازمند تأیید گواهی توسط سرور است.", "پایدار");
            Close();
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "نصب ناموفق", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally {
            _install.Enabled = true;
            try { Directory.Delete(staging, recursive: true); } catch (IOException) { }
        }
    }
}
