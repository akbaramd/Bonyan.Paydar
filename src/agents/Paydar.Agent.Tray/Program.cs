using System.Diagnostics;
using System.Drawing;
using System.Net.Http.Json;
using System.Security.Cryptography.X509Certificates;
using System.Windows.Forms;
using InfraGraph.Agent.Windows;

ApplicationConfiguration.Initialize();
if (args.Contains("--configure", StringComparer.OrdinalIgnoreCase))
{
    using var form = new ConfigurationForm();
    Application.Run(form);
}
else
{
    using var context = new PaydarTrayContext();
    Application.Run(context);
}

internal sealed class PaydarTrayContext : ApplicationContext
{
    private readonly NotifyIcon _tray;

    public PaydarTrayContext()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("تنظیم و تست اتصال پایدار", null, (_, _) => Configure());
        menu.Items.Add("نمایش آخرین اطلاعات", null, (_, _) => ShowSnapshot());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("خروج از آیکن", null, (_, _) => ExitThread());
        _tray = new NotifyIcon {
            Icon = SystemIcons.Application, Text = "Paydar Agent",
            Visible = true, ContextMenuStrip = menu
        };
        _tray.DoubleClick += (_, _) => Configure();
    }

    private static void Configure()
    {
        try
        {
            using var proc = Process.Start(new ProcessStartInfo(Environment.ProcessPath!, "--configure") {
                UseShellExecute = true, Verb = "runas"
            });
        }
        catch (System.ComponentModel.Win32Exception) { /* User declined UAC */ }
    }

    private static void ShowSnapshot()
    {
        var path = Path.Combine(AgentConfiguration.DirectoryPath, "last-inventory.json");
        if (!File.Exists(path)) {
            MessageBox.Show("هنوز اطلاعاتی از این سیستم جمع‌آوری نشده است.", "پایدار");
            return;
        }
        try
        {
            // Inventory directory is ACL-protected. Do not make it world-readable for tray UI.
            using var proc = Process.Start(new ProcessStartInfo("notepad.exe", '"' + path + '"') {
                UseShellExecute = true, Verb = "runas"
            });
        }
        catch (System.ComponentModel.Win32Exception) { /* User declined UAC */ }
    }

    protected override void ExitThreadCore()
    {
        _tray.Visible = false;
        _tray.Dispose();
        base.ExitThreadCore();
    }
}

internal sealed class ConfigurationForm : Form
{
    private readonly TextBox _url = new() { Width = 415 };
    private readonly TextBox _thumbprint = new() { Width = 415 };
    private readonly Label _identity = new() { AutoSize = true, MaximumSize = new Size(420, 0) };
    private readonly Label _result = new() { AutoSize = true, MaximumSize = new Size(420, 0) };
    private readonly Button _save = new() { Text = "ذخیره تنظیمات", Width = 130 };
    private readonly Button _check = new() { Text = "بررسی اتصال", Width = 130 };
    private AgentConfiguration _config;

    public ConfigurationForm()
    {
        Text = "Paydar Agent | اتصال امن";
        Width = 520; Height = 400;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false;
        RightToLeft = RightToLeft.Yes;
        RightToLeftLayout = true;
        _config = AgentConfiguration.Load();
        _url.Text = _config.ServerUrl ?? "";
        _thumbprint.Text = _config.ClientCertificateThumbprint ?? "";
        UpdateIdentity();

        var layout = new TableLayoutPanel {
            Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 9,
            AutoScroll = true, Padding = new Padding(12)
        };
        layout.Controls.Add(new Label { Text = "آدرس HTTPS سرور Agent Gateway", AutoSize = true });
        layout.Controls.Add(_url);
        layout.Controls.Add(new Label { Text = "اثر انگشت گواهی اختصاصی دستگاه (LocalMachine/My)", AutoSize = true });
        layout.Controls.Add(_thumbprint);
        layout.Controls.Add(_identity);
        var copy = new Button { Text = "کپی شناسه‌های نصب", Width = 150 };
        copy.Click += (_, _) => {
            Clipboard.SetText($"AgentId: {_config.AgentId}{Environment.NewLine}InstallationEpoch: {_config.InstallationEpoch}");
            _result.Text = "شناسه‌ها کپی شدند؛ فقط در پنل مدیریتی مجاز ثبت شوند.";
        };
        layout.Controls.Add(copy);
        var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, AutoSize = true };
        buttons.Controls.Add(_save);
        buttons.Controls.Add(_check);
        layout.Controls.Add(buttons);
        _result.Text = "برای آنلاین‌شدن، گواهی کلاینت باید در سرور توسط مدیر تأیید شده باشد.";
        layout.Controls.Add(_result);
        Controls.Add(layout);

        _save.Click += (_, _) => Save();
        _check.Click += async (_, _) => await CheckConnectionAsync();
    }

    private void UpdateIdentity() =>
        _identity.Text = $"Agent ID: {_config.AgentId}{Environment.NewLine}Installation Epoch: {_config.InstallationEpoch}";

    private bool Save()
    {
        try
        {
            if (!AgentConfiguration.IsValidHttpsUrl(_url.Text.Trim()))
                throw new ArgumentException("آدرس سرور باید HTTPS معتبر باشد.");
            var thumbprint = _thumbprint.Text.Replace(" ", "").Trim();
            if (thumbprint.Length != 0 &&
                (thumbprint.Length != 40 || !thumbprint.All(Uri.IsHexDigit)))
                throw new ArgumentException("اثر انگشت گواهی باید ۴۰ رقم هگزادسیمال باشد.");
            var id = _config.AgentId == Guid.Empty ? Guid.NewGuid() : _config.AgentId;
            var epoch = _config.InstallationEpoch == Guid.Empty ? Guid.NewGuid() : _config.InstallationEpoch;
            _config = _config with {
                AgentId = id, InstallationEpoch = epoch, ServerUrl = _url.Text.Trim().TrimEnd('/'),
                ClientCertificateThumbprint = thumbprint.Length == 0 ? null : thumbprint.ToUpperInvariant()
            };
            AgentConfiguration.Save(_config);
            UpdateIdentity();
            _result.Text = "تنظیمات ذخیره شد؛ سرویس در چرخه بعدی گزارش ارسال خواهد کرد.";
            return true;
        }
        catch (Exception ex) {
            _result.Text = "خطای تنظیمات: " + ex.Message;
            return false;
        }
    }

    private async Task CheckConnectionAsync()
    {
        if (!Save()) return;
        if (string.IsNullOrWhiteSpace(_config.ClientCertificateThumbprint)) {
            _result.Text = "برای تست اتصال باید گواهی کلاینت تنظیم شده باشد.";
            return;
        }

        _check.Enabled = false;
        _result.Text = "در حال بررسی هویت و اتصال به Gateway...";
        try
        {
            using var store = new X509Store(StoreName.My, StoreLocation.LocalMachine);
            store.Open(OpenFlags.ReadOnly);
            var certificate = store.Certificates.Find(
                X509FindType.FindByThumbprint, _config.ClientCertificateThumbprint, validOnly: true)
                .OfType<X509Certificate2>().FirstOrDefault(x => x.HasPrivateKey);
            if (certificate is null) {
                _result.Text = "گواهی معتبر با کلید خصوصی در مخزن LocalMachine/My یافت نشد.";
                return;
            }

            using var handler = new HttpClientHandler();
            handler.ClientCertificates.Add(certificate);
            using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(10) };
            var endpoint = new Uri(new Uri(_config.ServerUrl!), "/api/v1/agents/check");
            using var response = await client.PostAsJsonAsync(endpoint, new {
                _config.AgentId, _config.InstallationEpoch
            });
            _result.Text = response.IsSuccessStatusCode
                ? "گواهی و ثبت Agent در Gateway تأیید شدند؛ گزارش بعدی توسط سرویس ارسال می‌شود."
                : response.StatusCode == System.Net.HttpStatusCode.Unauthorized
                    ? "Gateway هویت Agent را نپذیرفت. ثبت مدیر و اثرانگشت گواهی را بررسی کنید."
                    : "Gateway پاسخ داد، اما اتصال تأیید نشد: HTTP " + (int)response.StatusCode;
        }
        catch (HttpRequestException) {
            _result.Text = "اتصال TLS یا شبکه برقرار نشد. گواهی سرور، DNS و Firewall را بررسی کنید.";
        }
        catch (TaskCanceledException) {
            _result.Text = "مهلت اتصال به Gateway پایان یافت.";
        }
        catch (Exception ex) {
            _result.Text = "خطا در تست اتصال: " + ex.GetType().Name;
        }
        finally { _check.Enabled = true; }
    }
}
