# Setting up a new machine

This guide takes a Windows 11 PC with WSL 2 to a working qi-v2 setup, by hand. It covers Git, GitHub access, Nix,
the two chanlun projects and Ollama. Each step says where to run it, what to type and how to tell that it worked.

**You don't need to clone this repository.** Read this page on GitHub, at
<https://github.com/zhifengzhang-sz/qi-v2-nix/blob/main/SETUP.md>. The projects fetch what they need from this
repository through Nix. It's public, so a local copy needs no login, only Git:

```bash
git clone https://github.com/zhifengzhang-sz/qi-v2-nix.git
```

Work through the steps in order. If a step's check already passes, skip that step.

| Step | What it sets up | Where you run it |
|---|---|---|
| [First](#what-you-need-first) | Windows 11, WSL 2 and access to the private projects | Windows and GitHub |
| [1](#1-git-and-the-github-cli) | Git, the GitHub CLI and your GitHub login | WSL |
| [2](#2-update-the-firmware) | SSD firmware and BIOS | Windows |
| [3](#3-systemd-and-mirrored-networking) | systemd and mirrored networking | WSL and Windows |
| [4](#4-nix) | Nix, with flakes | WSL |
| [5](#5-a-faster-download-site-for-nix) | A faster download site for Nix, if you need one | WSL |
| [6](#6-docker) | Docker | WSL |
| [7](#7-githubs-package-registry) | The login to GitHub's package registry | WSL |
| [8](#8-clone-the-projects) | The two projects | WSL |
| [9](#9-the-materials-project) | The materials project | WSL |
| [10](#10-the-book-project) | The book project | WSL |
| [11](#11-ollama) | Ollama and its models | Windows and PowerShell |

If something goes wrong, see [When something goes wrong](#when-something-goes-wrong). The section
[What has been tested](#what-has-been-tested) says how far each step has been proven.

## What you need first

### On the PC

- **Windows 11, version 22H2 or later.** Home and Pro both work, because WSL 2 is available on every desktop
  edition. Mirrored networking in step 3 needs 22H2 or later. Run `winver` to see your version.
- **An x86_64 CPU with virtualization turned on in the BIOS.** The projects build for `x86_64-linux` only. Task
  Manager shows this under Performance, CPU, Virtualization.
- **WSL 2 with Ubuntu 24.04.** If you don't have it, run this in a PowerShell opened as administrator. Restart if
  it asks, then open Ubuntu and create your user.

  ```powershell
  wsl --install -d Ubuntu-24.04
  ```

  Check that this lists `Ubuntu-24.04` with version `2`:

  ```powershell
  wsl -l -v
  ```

- **About 60 GB of free disk space,** or about 35 GB without Ollama's models.
- **Enough memory for WSL.** WSL gets half of the PC's memory by default, and a full Lean build uses up to 16 GB.
- **A GPU with about 20 GB of memory,** but only if you want `make ask`.

### On GitHub

You need a GitHub account, and the owner of the projects has to give that account read access to these:

| Kind | Names | Where the owner grants it |
|---|---|---|
| Repositories | `qi-v2-chanlun-materials`, `qi-v2-chanlun`, and `qi-v2-algo` for the chart viewer | The repository's Settings, Collaborators |
| Packages | `chanlun-content`, `clcpp` and `chanlun-query` | Each package's settings, Manage access |

Repository access and package access are separate, so a developer needs both.

### Two kinds of terminal

A block marked `powershell` runs in Windows PowerShell. A block marked `bash` runs in the Ubuntu terminal. Run a
block's lines one at a time unless it says otherwise.

## 1. Git and the GitHub CLI

Install them in Ubuntu. Ubuntu usually includes `git` and `curl` already, and this adds whatever is missing:

```bash
sudo apt update
sudo apt install -y git gh curl
```

Set the name and email for your commits:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Log in to GitHub:

```bash
gh auth login --git-protocol ssh --web --scopes read:packages,admin:public_key
```

It prints a one-time code. Open <https://github.com/login/device> in a Windows browser and enter the code. If `gh`
offers to create or upload an SSH key, accept and skip the next block.

Otherwise, create an SSH key and add it to GitHub. Skip `ssh-keygen` if `~/.ssh/id_ed25519` already exists.

```bash
ssh-keygen -t ed25519 -C "$(hostname)"
gh ssh-key add ~/.ssh/id_ed25519.pub --title "$(hostname)"
```

**If `gh` was already logged in,** it may lack the permission for packages. See what it has:

```bash
gh auth status
```

If `read:packages` isn't listed, add it. This also gives you a code to enter in a browser:

```bash
gh auth refresh -h github.com -s read:packages
```

**Check:** the version prints, `gh auth status` lists `read:packages`, and `ssh` greets you by your GitHub name.
The first time, `ssh` asks whether to trust github.com, so answer yes. It then exits with an error code, which is
normal because GitHub offers no shell.

```bash
git --version
gh auth status
ssh -T git@github.com
```

## 2. Update the firmware

Do this before the heavy downloads in step 9, and back up anything you can't replace. Nix writes tens of thousands of small files very quickly,
which is much heavier than normal use. That load has crashed Windows on a machine with old SSD firmware and an
old BIOS. The cause there isn't confirmed yet, but updating costs little.

1. Update the SSD's firmware with the maker's tool, such as Samsung Magician. It restarts the PC.
2. Update the motherboard's BIOS from the maker's support page.

**Check:** the tool shows no firmware update available.

## 3. systemd and mirrored networking

**Why:** Nix's daemon and the Lean builds need systemd. Mirrored networking gives WSL the same network as Windows,
so `localhost` reaches a program on Windows such as Ollama. WSL's default mode doesn't do that.

First look at the current setting in WSL:

```bash
cat /etc/wsl.conf
```

If it doesn't contain `systemd=true`, add it:

```bash
printf '[boot]\nsystemd=true\n' | sudo tee -a /etc/wsl.conf
```

Then open the WSL settings file on the Windows side. Notepad will offer to create it:

```powershell
notepad "$env:USERPROFILE\.wslconfig"
```

Add these lines and save the file:

```ini
[wsl2]
networkingMode=mirrored
dnsTunneling=true
autoProxy=true
```

Restart WSL from PowerShell. This stops everything running in WSL.

```powershell
wsl --shutdown
```

Open a new Ubuntu terminal.

**Check:** the first line prints `ok`, the addresses match the ones Windows shows, and the last line prints a
`200` status.

```bash
systemctl --user status >/dev/null && echo ok
ip -4 -br addr
curl -sI https://github.com | head -1
```

## 4. Nix

Run the installer. It asks for your password and asks to continue, so answer yes.

```bash
sh <(curl --proto '=https' --tlsv1.2 -L https://nixos.org/nix/install) --daemon
```

Turn on flakes and restart the daemon:

```bash
echo "experimental-features = nix-command flakes" | sudo tee -a /etc/nix/nix.conf
sudo systemctl restart nix-daemon
```

Open a new terminal.

**Check:** the version must be 2.26 or later, and the second line prints `ok`.

```bash
nix --version
nix flake --help >/dev/null && echo ok
```

## 5. A faster download site for Nix

Skip this step if `cache.nixos.org` is fast for you.

Nix doesn't choose a site by speed or location. It uses only the sites listed in its `substituters` setting,
and by default that is `cache.nixos.org` alone. If a listed site lacks a package, Nix tries the next one.

This test downloads one 10 MB file from each site and discards it. Run the whole block at once. If you use a VPN,
run it once with the VPN on and once with it off, because the results can be opposite.

```bash
f=nar/099m8pdr72cfrhpsfx3ka7f7pcvb75s24wkxvw3ycj5k8w3m7mbk.nar.zst
for b in \
  https://cache.nixos.org \
  https://mirrors.tuna.tsinghua.edu.cn/nix-channels/store \
  https://mirrors.ustc.edu.cn/nix-channels/store \
  https://mirror.sjtu.edu.cn/nix-channels/store
do
  site=${b#https://}; site=${site%%/*}
  addr=$(getent ahostsv4 $site | awk 'NR==1{print $1}')
  link=$(ip route get $addr 2>/dev/null | grep -o 'dev [a-z0-9]*')
  curl -s -L -m 15 -o /dev/null \
    -w "%{http_code}  %{speed_download} B/s  first byte %{time_starttransfer}s  $link  $site\n" \
    "$b/$f"
done
```

Each line starts with a status code:

- `200` means the site works. The speed is in bytes per second, so `1000000` is about 1 MB/s.
- `000` means the site couldn't be reached.
- `404` means the site doesn't have that file, so test with another file before trusting the result.

Add the fastest sites, keeping `cache.nixos.org` last. The priority numbers set the order, and a lower number is
tried first. This example puts the Shanghai Jiao Tong mirror first and the Tsinghua mirror second:

```bash
echo "substituters = https://mirror.sjtu.edu.cn/nix-channels/store?priority=10 https://mirrors.tuna.tsinghua.edu.cn/nix-channels/store?priority=20 https://cache.nixos.org/" | sudo tee -a /etc/nix/nix.conf
sudo systemctl restart nix-daemon
```

Mirrors carry the same signed packages, so no new key is needed.

**Check:** this lists the sites you added.

```bash
nix config show substituters
```

**A VPN can change which sites work.** On one tested network the mirrors reached 15 MB/s with the VPN off and
timed out with it on, while `cache.nixos.org` reached 1 MB/s with the VPN on and 0.02 MB/s with it off. In a case
like that, keep the VPN off for `nix develop` and turn it on for steps that reach GitHub if they are slow.

## 6. Docker

**Why:** the chart tools and the query tools run released images.

This installs Docker Engine inside Ubuntu and lets you run it without `sudo`:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Close the terminal and open a new one. Docker Desktop on Windows also works, with its WSL integration turned on
for this distribution under Settings, Resources, WSL integration.

**Check:**

```bash
docker info >/dev/null && echo ok
```

## 7. GitHub's package registry

The projects' data and tools are private images on GitHub's registry, GHCR. `crane` reads them, and it comes from
Nix. This logs it in with your `gh` login from step 1:

```bash
gh auth token | nix run nixpkgs#crane -- auth login ghcr.io -u "$(gh api user --jq .login)" --password-stdin
```

`crane` warns that the login is stored unencrypted in `~/.docker/config.json`. That's expected, and Docker uses the
same login.

**Check:** both lines list image tags.

```bash
nix run nixpkgs#crane -- ls ghcr.io/zhifengzhang-sz/chanlun-content
nix run nixpkgs#crane -- ls ghcr.io/zhifengzhang-sz/clcpp
```

`UNAUTHORIZED: authentication required` means the registry login is missing. A refusal after a successful login
means the account hasn't been given access to that package.

## 8. Clone the projects

The folder can be anywhere. The book reaches the materials through its flake, not through a path.

```bash
mkdir -p ~/dev/qi/github
cd ~/dev/qi/github
git clone git@github.com:zhifengzhang-sz/qi-v2-chanlun-materials.git
git clone git@github.com:zhifengzhang-sz/qi-v2-chanlun.git
```

`Repository not found` means your account hasn't been given access yet. See [On GitHub](#on-github).

## 9. The materials project

Keep the terminal open until these finish. The first `nix develop` downloads a few GB, and it can show little
progress while it does.

```bash
cd ~/dev/qi/github/qi-v2-chanlun-materials
nix develop
```

The prompt now shows `(materials)`. Run the rest inside that shell, because `make` stops outside it.

The shell may say `content ... not installed`, which the next commands fix. It may also say `ollama is not on this
machine`. That's harmless when Ollama runs on Windows, because the tools reach it through `localhost`.

`make install` downloads the content from GHCR and then asks Nix's download sites for packages. If one network
reaches both, this is all you need:

```bash
make install
make locks-check
```

If it doesn't, such as when GHCR needs a VPN and your Nix mirrors time out through it, run the two parts apart. Turn
the VPN on for the download:

```bash
make content-fetch
```

Then turn it off for the rest. `make install` finds the downloaded files and doesn't contact GHCR again.

```bash
make install
make locks-check
```

`make install` puts the content into the Nix store and links it as `.content`. It also sets git's hooks and
writes the agent files.

**Check:** `.content` exists, and `make locks-check` prints one line for each lock.

```bash
ls -d .content
```

An `outdated` line is a report, not a failure. Don't update a lock unless you mean to.

`docs/opening.md` says where the work stands. These two are optional. The first builds Lean from nothing, using
about 12 GB of memory, and the second opens one chart.

```bash
make verify VERIFY=--all
make chart I=SH000001 P=1m FROM=2007-05-23 TO=2007-05-23
```

Type `exit` to leave the shell.

## 10. The book project

```bash
cd ~/dev/qi/github/qi-v2-chanlun
nix develop
```

The prompt now shows `(book)`. Inside that shell:

```bash
make install
make locks-check
```

**Check:** this builds the two About PDFs in `tex/`.

```bash
make about-pdfs
```

Building the book's chart viewer also needs git's GitHub login over HTTPS:

```bash
gh auth setup-git
```

## 11. Ollama

Ollama is only needed for `make ask`, search by meaning, and making vectors. Everything else works without it.

Install the latest version from <https://ollama.com/download> and start it. Then pull the two models. They come
to about 23 GB.

```powershell
ollama pull Qwen3-Embedding
ollama pull gemma4:26b
```

Type the names exactly as shown. The projects compare model names letter for letter, so a lowercase
`qwen3-embedding` works in Ollama but the project reports it as missing.

**Check:** run this in WSL. It lists both models, and `ollama list` in PowerShell shows the ID `64b933495768` for
`Qwen3-Embedding`, which is the version the project pins.

```bash
curl -s http://localhost:11434/api/tags | python3 -c 'import sys,json; [print(m["name"]) for m in json.load(sys.stdin)["models"]]'
```

## For the owner: restoring from the USB drive

This section only applies to the owner's USB drive. It can stand in for the login in step 1 and the registry login
in step 7, and it brings back local notes that Git doesn't carry. You need the archive's passphrase, which isn't
written down anywhere.

WSL doesn't mount a USB drive by itself. Replace `f` with your drive's letter:

```bash
sudo mkdir -p /mnt/f
sudo mount -t drvfs F: /mnt/f
```

### Restore the keys

The archive holds the SSH key, the logins and the data keys. Unpacking it **replaces** any of those files already
in your home folder, so back them up first. `gpg` asks for the passphrase.

```bash
sudo apt install gnupg
cd /mnt/f/rxt-5090-nj/dev
gpg -d keys-2026-10-28.tar.gz.gpg | tar xzf - -C ~
chmod 600 ~/.ssh/id_ed25519 ~/.config/chanlun/massive_key ~/.aws/credentials \
          ~/.config/gh/hosts.yml ~/.docker/config.json ~/.claude/.credentials.json
```

This also creates `~/dev/qi/qi-v2-chanlun-materials/`, which holds only notes. You can ignore that folder, because
the next step copies the same notes from the drive.

### Copy the notes

Do this after step 8. The `.` at the end of each source path includes hidden folders such as `.reports`.

```bash
USB=/mnt/f/rxt-5090-nj/dev
cp -r $USB/qi-v2-chanlun-materials/. ~/dev/qi/github/qi-v2-chanlun-materials/
cp -r $USB/qi-v2-chanlun/. ~/dev/qi/github/qi-v2-chanlun/
```

Files with the same name are replaced, so a tracked file can show as modified. Look at the change first:

```bash
git -C ~/dev/qi/github/qi-v2-chanlun-materials status --short
```

Nix then warns `Git tree ... is dirty` in that project. The warning is harmless.

## Extras

| You want | What to do |
|---|---|
| The tools inside VS Code | Follow `docs/content.md`, The editor, in the materials project (direnv) |
| The weekly market data update | Needs `~/.config/chanlun/massive_key`, from the archive or the vendor's dashboard |
| The Nix binary cache | Needs `~/.aws/credentials`, from the archive; see `practices.md`, section 5 |

## When something goes wrong

### After any crash or forced shutdown

Check the Nix store before you run anything else. Files written just before a crash can be left empty, and Nix
still treats those packages as installed. This prints a line for each damaged package, and nothing if the store
is clean:

```bash
nix store verify --all --no-trust 2>&1 | grep 'was modified'
```

To repair the store, run this as one line. It fetches damaged packages again and rebuilds local ones:

```bash
sudo /nix/var/nix/profiles/default/bin/nix-store --verify --check-contents --repair; sync
```

Run `sync` before any `wsl --shutdown` during setup. It forces recent writes onto the disk.

### Windows crashes during a Nix download

Stop running Nix until you know the cause. A crash can damage more than the Nix store, so copy anything
irreplaceable off the drive first.

| Check | How |
|---|---|
| The crash code | Event Viewer, Windows Logs, System, event 41 from Kernel-Power |
| Disk errors | Event Viewer, sources `disk`, `stornvme` and `Ntfs` |
| Drive health | The SSD maker's tool: its S.M.A.R.T. values and extended self-test |
| The file system | `chkdsk C: /scan` in an administrator PowerShell |
| Memory | Windows Memory Diagnostic or MemTest86 |
| Firmware | Update the SSD's firmware and the BIOS (step 2) |

`KERNEL_DATA_INPAGE_ERROR` means Windows couldn't read its own data from disk. `CRITICAL_PROCESS_DIED` has many
possible causes. If the dump file also fails to write, suspect the drive or its connection.

### Error messages

| What you see | What it means | What to do |
|---|---|---|
| `WslRegisterDistribution failed with error: 0x80370102` | Virtualization is off | Turn it on in the BIOS, as SVM on AMD or VT-x on Intel |
| `makeWrapper: command not found`, or another standard tool is missing during a build | A package in the store is damaged | Check and repair the store, as above |
| `sudo: nix-store: command not found` | `sudo` doesn't use your `PATH` | Use the full path, as in the repair command above |
| `error: no arguments expected` | Two commands were joined on one line | Run them separately, or put `;` between them |
| `Could not resolve host` or `no such host` | A DNS failure, often while a VPN is changing | Run the command again |
| `No such file or directory` under `/mnt/f` | WSL hasn't mounted the USB drive | Mount it, as in [the USB section](#for-the-owner-restoring-from-the-usb-drive) |
| `UNAUTHORIZED: authentication required` | The registry login is missing | Do step 7 |
| `Repository not found` | Your account has no access to that private repository | Ask the owner for access |
| `make` stops with a message about the shell | You are outside `nix develop` | Run `nix develop` first |
| `Git tree ... is dirty` | The clone has uncommitted changes | Nothing, it's harmless |
| `pull model manifest: 412` | Ollama is too old for that model | Update Ollama |
| `Ollama lacks Qwen3-Embedding`, though the model is installed | The model was pulled with the wrong letter case | See below |
| Nothing answers at `localhost:11434` | Ollama isn't running, or WSL isn't in mirrored mode | Start Ollama, then check step 3 |
| A request to Ollama is reset, and its log shows `0xc0000417` | The Ollama server crashed and is restarting itself | Wait about 15 seconds and try again |
| Nix downloads crawl | The site is slow from your network | Do step 5 |
| A mirror returns `000` | The site can't be reached, often because of a VPN | Test again with the VPN off |
| `unable to download ... .narinfo: Timeout was reached` | A Nix mirror can't be reached, often because of a VPN | Wait, because Nix moves on to the next site; or use `make content-fetch` as in step 9 |

To fix the model's letter case without downloading it again, keep a temporary copy while you rename it:

```powershell
ollama cp qwen3-embedding qwen3-keep
ollama rm qwen3-embedding
ollama pull Qwen3-Embedding
ollama rm qwen3-keep
```

## What has been tested

Last updated 2026-10-31, from a setup on a Windows 11 Pro machine that already had WSL, Docker and a GitHub login.
Windows 11 Home is supported by WSL but hasn't been tried with this guide.

| Part | State |
|---|---|
| Step 1: adding `read:packages` to an existing `gh` login | Done and checked |
| Step 1: `apt` install, fresh login and new SSH key | Not run for this guide |
| Step 2: firmware and BIOS | SSD firmware updated, and the repair's heavy downloads then finished with no crash; BIOS not updated |
| Steps 3 and 4: networking, Nix and flakes | Done and checked |
| Step 5: mirror test and `substituters` | Done and checked |
| Step 6: Docker install | Not run for this guide |
| Step 7: registry login and checks | Done and checked |
| Step 8: clones | Done and checked |
| Step 11: Ollama update and models | Done; on Ollama 0.40.13 the server crashed during some embedding requests |
| USB drive | Notes copy done; archive restore not run for this guide |
| WSL install | Not run for this guide |
| Store check and repair commands | Done and checked: the repair restored 249 damaged packages |
| Step 9: `nix develop` and `make install` | Done and checked; the content verified with 837 files, and no crash after the firmware update |
| Step 9: `make content-fetch` | Tested only with the files already present; not yet on a real download |
| Step 9: `make locks-check` | Not yet run |
| Step 10: the book project | Not run for this guide |

The materials project's own setup, the source of steps 4 and 9, passed on an empty Ubuntu 24.04 under WSL on
2026-10-21 without steps 3 and 6.
