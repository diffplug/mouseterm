use std::{
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

fn main() {
    println!("cargo:rerun-if-env-changed=MOUSETERM_NODE_BINARY");
    println!("cargo:rerun-if-env-changed=NODE_BINARY");
    println!("cargo:rerun-if-env-changed=PATH");

    bundle_node_runtime().expect("failed to prepare bundled Node.js runtime");
    tauri_build::build()
}

fn bundle_node_runtime() -> Result<(), Box<dyn Error>> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
    let target = env::var("TARGET")?;
    let host = env::var("HOST")?;
    let node_source = resolve_node_binary(&host, &target)?;

    println!("cargo:rerun-if-changed={}", node_source.display());
    validate_node_binary(&node_source, &target)?;

    let binaries_dir = manifest_dir.join("binaries");
    fs::create_dir_all(&binaries_dir)?;

    let node_dest = binaries_dir.join(node_binary_name(&target));
    fs::copy(&node_source, &node_dest)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut perms = fs::metadata(&node_dest)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&node_dest, perms)?;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn validate_node_binary(node_source: &Path, target: &str) -> Result<(), Box<dyn Error>> {
    if target.contains("apple-darwin") {
        reject_macos_dynamic_node(node_source)?;
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn validate_node_binary(_node_source: &Path, _target: &str) -> Result<(), Box<dyn Error>> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn reject_macos_dynamic_node(node_source: &Path) -> Result<(), Box<dyn Error>> {
    let output = Command::new("otool").arg("-L").arg(node_source).output()?;
    if !output.status.success() {
        return Err(format!(
            "failed to inspect Node.js runtime at {}",
            node_source.display()
        )
        .into());
    }

    let deps = String::from_utf8_lossy(&output.stdout);
    if deps.contains("@rpath/libnode.") {
        return Err(format!(
            "{} depends on @rpath/libnode*.dylib and cannot be copied as a self-contained Tauri sidecar. Use a standalone Node.js binary, or set MOUSETERM_NODE_BINARY to one.",
            node_source.display()
        )
        .into());
    }

    Ok(())
}

fn resolve_node_binary(host: &str, target: &str) -> Result<PathBuf, Box<dyn Error>> {
    if let Some(path) = env::var_os("MOUSETERM_NODE_BINARY").or_else(|| env::var_os("NODE_BINARY"))
    {
        return Ok(PathBuf::from(path));
    }

    if host != target {
        return Err(format!(
            "cross-compiling the standalone app requires MOUSETERM_NODE_BINARY for target {target}"
        )
        .into());
    }

    let output = Command::new("node")
        .args(["-p", "process.execPath"])
        .output()?;
    if !output.status.success() {
        return Err("failed to locate Node.js via `node -p process.execPath`".into());
    }

    let node_path = String::from_utf8(output.stdout)?.trim().to_owned();
    if node_path.is_empty() {
        return Err("`node -p process.execPath` returned an empty path".into());
    }

    Ok(PathBuf::from(node_path))
}

fn node_binary_name(target: &str) -> String {
    if target.contains("windows") {
        format!("node-{target}.exe")
    } else {
        format!("node-{target}")
    }
}
