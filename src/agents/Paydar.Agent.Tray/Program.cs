using System.Diagnostics;
using System.Drawing;
using System.Security.Principal;
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
        menu.Items.Add("تنظیم اتصال به سرور", null, (_, _) => Configure());
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
            using var proc = Process.Start(new ProcessStartInfo(Environment.ProcessPath!, "--configure")
            { UseShellExecute = true, Verb = "runas" });
        }
        catch (System.ComponentModel.Win32Exception) { /* user cancelled elevation */ }
    }
    private static void ShowSnapshot()
    {
        var path = Path.Combine(AgentConfiguration.DirectoryPath, "last-inventory.json");
        if (!File.Exists(path))
        { MessageBox.Show("هنوز اطلاعاتی از این سیستم جمع آوری نشده است.", "پایدار"); return; }
        using var proc = Process.Start(new ProcessStartInfo("notepad.exe", '"' + path + '"') { UseShellExecute = true });
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
    private readonly TextBox _url = new() { Width = 360 };
    private readonly TextBox _thumbprint = new() { Width = 360 };
    public ConfigurationForm()
    {
        Text = "Paydar Agent — Configuration";
        Width = 475; Height = 245;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false;
        RightToLeft = RightToLeft.Yes;
        RightToLeftLayout = true;
        var config = AgentConfiguration.Load();
        _url.Text = config.ServerUrl ?? "";
        _thumbprint.Text = config.ClientCertificateThumbprint ?? "";
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(12) };
        layout.Controls.Add(new Label { Text = "آدرس HTTPS سرور Agent Gateway", Dock = DockStyle.Fill });
        layout.Controls.Add(_url);
        layout.Controls.Add(new Label { Text = "Thumbprint گواهی کلاینت (LocalMachine/My)", Dock = DockStyle.Fill });
        layout.Controls.Add(_thumbprint);
        var button = new Button { Text = "ذخیره و اتصال", Width = 160 };
        button.Click += (_, _) => Save(config);
        layout.Controls.Add(button);
        Controls.Add(layout);
    }
    private void Save(AgentConfiguration old)
    {
        try
        {
            if (!AgentConfiguration.IsValidHttpsUrl(_url.Text.Trim()))
                throw new ArgumentException("آدرس سرور باید HTTPS معتبر باشد.");
            var id = old.AgentId == Guid.Empty ? Guid.NewGuid() : old.AgentId;
            var epoch = old.InstallationEpoch == Guid.Empty ? Guid.NewGuid() : old.InstallationEpoch;
            AgentConfiguration.Save(old with {
                AgentId = id, InstallationEpoch = epoch,
                ServerUrl = _url.Text.Trim().TrimEnd('/'),
                ClientCertificateThumbprint = _thumbprint.Text.Trim().Replace(" ", "")
            });
            MessageBox.Show("تنظیمات ذخیره شد. سرویس در چرخه بعدی اتصال را بررسی می‌کند.", "پایدار");
            Close();
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "پایدار", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}
