package main

import (
	"archive/zip"
	"bytes"
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

//go:embed app/**
var appAssets embed.FS

const (
	electronVersion = "33.2.0"
	electronURL     = "https://github.com/electron/electron/releases/download/v33.2.0/electron-v33.2.0-win32-x64.zip"
	appMarker       = "main.js"
)

func main() {
	base := filepath.Join(os.Getenv("LOCALAPPDATA"), "ClearwaterPhone")
	appDir := filepath.Join(base, "app")
	electronDir := filepath.Join(base, "electron-v"+electronVersion)
	electronExe := filepath.Join(electronDir, "electron.exe")

	fmt.Println("Clearwater Phone")
	fmt.Println("----------------")

	if err := os.MkdirAll(base, 0o755); err != nil {
		fatal("Could not create app folder:", err)
	}

	fmt.Println("Updating app files...")
	if err := extractEmbeddedApp(appDir); err != nil {
		fatal("Could not install app files:", err)
	}

	if _, err := os.Stat(electronExe); err != nil {
		fmt.Println("First launch: downloading runtime (one-time, ~100 MB)...")
		if err := downloadAndUnzip(electronURL, electronDir); err != nil {
			fatal("Could not download runtime. Check your internet and try again.\n", err)
		}
	}

	if _, err := os.Stat(electronExe); err != nil {
		fatal("Runtime is missing after download:", err)
	}
	if _, err := os.Stat(filepath.Join(appDir, appMarker)); err != nil {
		fatal("App files are incomplete:", err)
	}

	fmt.Println("Opening Clearwater Phone...")
	fmt.Println("Press F8 in-game to hide or show the overlay.")

	cmd := exec.Command(electronExe, appDir)
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		fatal("Could not start Clearwater Phone:", err)
	}

	// Detach: exit launcher after Electron is up.
	time.Sleep(800 * time.Millisecond)
}

func extractEmbeddedApp(dest string) error {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	return fs.WalkDir(appAssets, "app", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel := strings.TrimPrefix(path, "app")
		rel = strings.TrimPrefix(rel, "/")
		rel = strings.TrimPrefix(rel, "\\")
		if rel == "" {
			return nil
		}
		out := filepath.Join(dest, filepath.FromSlash(rel))
		if d.IsDir() {
			return os.MkdirAll(out, 0o755)
		}
		data, err := appAssets.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
			return err
		}
		return os.WriteFile(out, data, 0o644)
	})
}

func downloadAndUnzip(url, dest string) error {
	tmpZip := filepath.Join(os.TempDir(), "clearwater-electron.zip")
	_ = os.Remove(tmpZip)

	client := &http.Client{Timeout: 10 * time.Minute}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "ClearwaterPhone/1.0")
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", res.StatusCode)
	}

	out, err := os.Create(tmpZip)
	if err != nil {
		return err
	}
	written, err := io.Copy(out, res.Body)
	out.Close()
	if err != nil {
		return err
	}
	if written < 1_000_000 {
		return fmt.Errorf("download looked incomplete (%d bytes)", written)
	}

	if err := os.RemoveAll(dest); err != nil {
		return err
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	if err := unzip(tmpZip, dest); err != nil {
		return err
	}
	_ = os.Remove(tmpZip)
	return nil
}

func unzip(zipPath, dest string) error {
	data, err := os.ReadFile(zipPath)
	if err != nil {
		return err
	}
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}
	for _, f := range r.File {
		name := filepath.Clean(f.Name)
		if strings.HasPrefix(name, "..") {
			continue
		}
		target := filepath.Join(dest, name)
		if !strings.HasPrefix(target, filepath.Clean(dest)+string(os.PathSeparator)) && filepath.Clean(target) != filepath.Clean(dest) {
			continue
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		out.Close()
		rc.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}

func fatal(args ...any) {
	fmt.Fprintln(os.Stderr, args...)
	fmt.Println()
	fmt.Println("Press Enter to close...")
	_, _ = fmt.Scanln()
	os.Exit(1)
}
