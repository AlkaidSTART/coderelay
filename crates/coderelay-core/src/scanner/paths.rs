use std::collections::BTreeMap;
use std::path::Path;

use crate::host::Platform;
use crate::scanner::types::CliSource;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallDir {
    pub dir: String,
    pub source: CliSource,
}

const DEFAULT_PATHEXT: [&str; 4] = [".COM", ".EXE", ".BAT", ".CMD"];

fn env_value<'a>(env: &'a BTreeMap<String, String>, key: &str) -> Option<&'a str> {
    env.get(key)
        .map(String::as_str)
        .filter(|value| !value.trim().is_empty())
}

fn join(platform: Platform, parts: &[&str]) -> String {
    let separator = platform.path_separator().to_string();
    parts
        .iter()
        .filter(|part| !part.is_empty())
        .map(|part| part.trim_end_matches(['/', '\\']))
        .collect::<Vec<_>>()
        .join(&separator)
}

pub fn executable_names(
    bin: &str,
    platform: Platform,
    env: &BTreeMap<String, String>,
) -> Vec<String> {
    if platform != Platform::Win32 {
        return vec![bin.to_owned()];
    }

    let declared = env_value(env, "PATHEXT");
    let extensions: Vec<String> = declared
        .map(|value| {
            value
                .split(';')
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .collect()
        })
        .unwrap_or_else(|| DEFAULT_PATHEXT.to_vec())
        .into_iter()
        .map(|extension| {
            let lower = extension.to_lowercase();
            if lower.starts_with('.') {
                lower
            } else {
                format!(".{lower}")
            }
        })
        .collect();

    let mut names = Vec::new();
    for extension in extensions {
        let name = format!("{bin}{extension}");
        if !names.contains(&name) {
            names.push(name);
        }
    }
    if !names.contains(&bin.to_owned()) {
        names.push(bin.to_owned());
    }
    names
}

pub fn candidate_paths_in_dir(
    dir: &str,
    bin: &str,
    platform: Platform,
    env: &BTreeMap<String, String>,
) -> Vec<String> {
    let base = dir.trim_end_matches(['/', '\\']);
    executable_names(bin, platform, env)
        .into_iter()
        .map(|name| join(platform, &[base, &name]))
        .collect()
}

pub fn user_install_dirs(
    platform: Platform,
    home_dir: &Path,
    env: &BTreeMap<String, String>,
) -> Vec<InstallDir> {
    let home = home_dir.to_string_lossy();
    let mut dirs = vec![
        InstallDir {
            dir: join(platform, &[&home, ".local", "bin"]),
            source: CliSource::Installer,
        },
        InstallDir {
            dir: join(platform, &[&home, ".bun", "bin"]),
            source: CliSource::Bun,
        },
    ];

    if platform == Platform::Win32 {
        if let Some(app_data) = env_value(env, "APPDATA") {
            dirs.push(InstallDir {
                dir: join(platform, &[app_data, "npm"]),
                source: CliSource::Npm,
            });
        }
        if let Some(local_app_data) = env_value(env, "LOCALAPPDATA") {
            dirs.push(InstallDir {
                dir: join(platform, &[local_app_data, "Microsoft", "WinGet", "Links"]),
                source: CliSource::Winget,
            });
        }
    }

    dirs
}

pub fn standard_install_dirs(platform: Platform, home_dir: &Path) -> Vec<InstallDir> {
    let mut dirs = Vec::new();
    let home = home_dir.to_string_lossy();

    if platform == Platform::Darwin {
        dirs.push(InstallDir {
            dir: "/opt/homebrew/bin".to_owned(),
            source: CliSource::Brew,
        });
        dirs.push(InstallDir {
            dir: "/usr/local/bin".to_owned(),
            source: CliSource::Brew,
        });
    }

    if platform != Platform::Win32 {
        dirs.push(InstallDir {
            dir: join(platform, &[&home, ".nix-profile", "bin"]),
            source: CliSource::Nix,
        });
        dirs.push(InstallDir {
            dir: "/nix/var/nix/profiles/default/bin".to_owned(),
            source: CliSource::Nix,
        });
        dirs.push(InstallDir {
            dir: join(platform, &[&home, ".local", "share", "mise", "shims"]),
            source: CliSource::Mise,
        });
    }

    dirs
}

fn normalize_for_compare(value: &str, platform: Platform) -> String {
    let normalized = value.replace('\\', "/").trim_end_matches('/').to_owned();
    if platform == Platform::Win32 {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

pub fn classify_source_in(file_path: &str, dirs: &[InstallDir], platform: Platform) -> CliSource {
    let target = normalize_for_compare(file_path, platform);
    for entry in dirs {
        let dir = normalize_for_compare(&entry.dir, platform);
        if !dir.is_empty() && target.starts_with(&format!("{dir}/")) {
            return entry.source;
        }
    }
    CliSource::Path
}

pub fn dedupe_paths(paths: impl IntoIterator<Item = String>, platform: Platform) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    paths
        .into_iter()
        .filter(|path| seen.insert(normalize_for_compare(path, platform)))
        .collect()
}

pub fn path_entries(platform: Platform, env: &BTreeMap<String, String>) -> Vec<String> {
    let separator = if platform == Platform::Win32 {
        ';'
    } else {
        ':'
    };
    env_value(env, "PATH")
        .unwrap_or_default()
        .split(separator)
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_owned)
        .collect()
}

pub fn is_dir_on_path(dir: &str, platform: Platform, env: &BTreeMap<String, String>) -> bool {
    let target = normalize_for_compare(dir, platform);
    path_entries(platform, env)
        .iter()
        .any(|entry| normalize_for_compare(entry, platform) == target)
}
