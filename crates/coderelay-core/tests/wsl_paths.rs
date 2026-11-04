use std::collections::BTreeMap;

use coderelay_core::scanner::{
    build_wsl_args, decode_wsl_output, normalize_mount_root, parse_wsl_conf_automount,
    parse_wsl_distros, resolve_wsl_mount_root, to_windows_path, to_wsl_path,
};

#[test]
fn wsl_mount_root_and_path_conversion_cover_default_and_custom_roots() {
    assert_eq!(normalize_mount_root("/mnt/"), "/mnt");
    assert_eq!(normalize_mount_root("/"), "/");
    assert_eq!(
        to_wsl_path("C:\\Users\\fixture\\project", None).as_deref(),
        Some("/mnt/c/Users/fixture/project")
    );
    assert_eq!(
        to_wsl_path("D:\\work", Some("/windir")).as_deref(),
        Some("/windir/d/work")
    );
    assert_eq!(
        to_windows_path("/mnt/c/Users/fixture/project", None).as_deref(),
        Some("C:\\Users\\fixture\\project")
    );
    assert_eq!(
        to_windows_path("/windir/d/work", Some("/windir")).as_deref(),
        Some("D:\\work")
    );
}

#[test]
fn wsl_conf_automount_and_environment_overrides_are_honored() {
    let config =
        parse_wsl_conf_automount("[automount]\nenabled = false\nroot = \"/windir\" # comment\n");
    assert!(!config.enabled);
    assert_eq!(config.root, "/windir");

    let env = BTreeMap::from([("WSL_AUTOMOUNT_ROOT".to_owned(), "/wsl".to_owned())]);
    assert_eq!(resolve_wsl_mount_root(None, &env).as_deref(), Some("/wsl"));
    assert_eq!(
        resolve_wsl_mount_root(Some("/explicit"), &env).as_deref(),
        Some("/explicit")
    );
}

#[test]
fn wsl_output_and_args_preserve_documented_shape() {
    assert_eq!(
        parse_wsl_distros("Ubuntu\0\r\nDebian\0\r\n"),
        vec!["Ubuntu", "Debian"]
    );
    assert_eq!(decode_wsl_output("a\0b"), "ab");
    assert_eq!(
        build_wsl_args(
            Some("Ubuntu"),
            &["sh".to_owned(), "-lc".to_owned(), "pwd".to_owned()]
        ),
        vec!["-d", "Ubuntu", "--", "sh", "-lc", "pwd"]
    );
}
