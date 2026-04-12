/** Runtime host detection for SteamCMD, RustDedicated, and Oxide asset selection. */

export function isWindowsHost(): boolean {
  return process.platform === 'win32'
}

/** Steam app_update platform for Rust dedicated (258550). */
export function rustDedicatedSteamPlatformType(): 'windows' | 'linux' {
  return isWindowsHost() ? 'windows' : 'linux'
}

export function rustDedicatedBinaryName(): string {
  return isWindowsHost() ? 'RustDedicated.exe' : 'RustDedicated'
}

/** GitHub Oxide.Rust release asset name for this host. */
export function oxideRustZipAssetName(): string {
  return isWindowsHost() ? 'Oxide.Rust.zip' : 'Oxide.Rust-linux.zip'
}

/** Stored in .oxidized-oxide-version so switching OS / asset family re-fetches. */
export function oxideMarkerPlatformKey(): string {
  return isWindowsHost() ? 'win32' : 'linux'
}

export function hostPlatformLabel(): string {
  if (isWindowsHost()) return 'Windows'
  if (process.platform === 'darwin') return 'macOS'
  return 'Linux'
}
