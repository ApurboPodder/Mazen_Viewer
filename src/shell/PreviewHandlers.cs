using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Windows.Forms;
using SharpShell.Attributes;
using SharpShell.SharpPreviewHandler;
using SharpShell.SharpThumbnailHandler;

namespace MAZEN.ShellExtensions
{
    internal static class SupportedTypes
    {
        internal static readonly string[] Extensions = {
            ".glb", ".stl", ".fbx", ".3dm", ".stp", ".step", ".igs", ".iges", ".obj", ".ply",
            ".dae", ".3ds", ".3mf", ".amf", ".pdf", ".svg", ".png", ".jpg", ".jpeg", ".webp",
            ".bmp", ".gif", ".tif", ".tiff", ".cdr", ".cmx"
        };
    }

    internal static class PreviewRenderer
    {
        internal static string Render(string sourcePath)
        {
            var shellDirectory = Path.GetDirectoryName(typeof(PreviewRenderer).Assembly.Location);
            var appPath = Path.GetFullPath(Path.Combine(shellDirectory, "..", "..", "MAZEN Viewer.exe"));
            if (!File.Exists(appPath)) throw new FileNotFoundException("MAZEN Viewer is not installed in its expected location.", appPath);

            var outputPath = Path.Combine(Path.GetTempPath(), "mazen-preview-" + Guid.NewGuid().ToString("N") + ".png");
            using (var process = Process.Start(new ProcessStartInfo {
                FileName = appPath,
                Arguments = "--make-preview " + Quote(sourcePath) + " " + Quote(outputPath),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            }))
            {
                if (process == null || !process.WaitForExit(50000))
                {
                    try { process?.Kill(); } catch { }
                    throw new TimeoutException("The file preview took too long to render.");
                }
                if (process.ExitCode != 0 || !File.Exists(outputPath))
                    throw new InvalidDataException("MAZEN Viewer could not render a preview for this file.");
            }
            return outputPath;
        }

        private static string Quote(string value) => "\"" + value + "\"";
    }

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    [Guid("9E287A25-187A-4E1E-AB41-79392D3A9E63")]
    [System.ComponentModel.DisplayName("MAZEN Viewer Preview Handler")]
    [PreviewHandler(DisableLowILProcessIsolation = true)]
    public sealed class MAZENPreviewHandler : SharpPreviewHandler
    {
        protected override PreviewHandlerControl DoPreview()
        {
            var control = new PreviewImageControl();
            control.ShowFile(SelectedFilePath);
            return control;
        }
    }

    public sealed class PreviewImageControl : PreviewHandlerControl
    {
        private readonly PictureBox picture;

        public PreviewImageControl()
        {
            BackColor = Color.FromArgb(37, 40, 46);
            picture = new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, BackColor = BackColor };
            Controls.Add(picture);
        }

        public void ShowFile(string path)
        {
            try
            {
                var previewPath = PreviewRenderer.Render(path);
                using (var source = Image.FromFile(previewPath)) picture.Image = new Bitmap(source);
                try { File.Delete(previewPath); } catch { }
            }
            catch
            {
                Controls.Clear();
                Controls.Add(new Label {
                    Dock = DockStyle.Fill,
                    TextAlign = ContentAlignment.MiddleCenter,
                    ForeColor = Color.Gainsboro,
                    BackColor = BackColor,
                    Text = "MAZEN Viewer could not preview this file."
                });
            }
        }
    }

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    [Guid("82D1D3FC-EC7F-495A-9288-5A3DF4C4E032")]
    [System.ComponentModel.DisplayName("MAZEN Viewer Thumbnail Provider")]
    public sealed class MAZENThumbnailHandler : SharpThumbnailHandler
    {
        protected override Bitmap GetThumbnailImage(uint width)
        {
            try
            {
                if (SelectedItemStream == null) return null;
                SelectedItemStream.Stat(out var stat, 0);
                var sourcePath = stat.pwcsName;
                if (string.IsNullOrWhiteSpace(sourcePath) || !File.Exists(sourcePath)) return null;
                var previewPath = PreviewRenderer.Render(sourcePath);
                Bitmap result;
                using (var source = Image.FromFile(previewPath))
                using (var bitmap = new Bitmap(source))
                {
                    var size = (int)Math.Max(32, Math.Min(width, 512));
                    var scale = Math.Min((double)size / bitmap.Width, (double)size / bitmap.Height);
                    result = new Bitmap(Math.Max(1, (int)(bitmap.Width * scale)), Math.Max(1, (int)(bitmap.Height * scale)));
                    using (var graphics = Graphics.FromImage(result))
                    {
                        graphics.Clear(Color.FromArgb(37, 40, 46));
                        graphics.DrawImage(bitmap, new Rectangle(0, 0, result.Width, result.Height));
                    }
                }
                try { File.Delete(previewPath); } catch { }
                return result;
            }
            catch { return null; }
        }
    }
}
