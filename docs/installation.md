# Installation Guide

## 🚀 For Users (The Easy Way)

This package is designed to verify and visualize agent behavior in OpenCode.

### Step 1: Install the Package
Open your terminal and install the package globally:
```bash
npm install -g opencode-pixel-office
```

### Step 2: Run the Installer
Run the interactive installer to set up the plugin and the standalone application:
```bash
opencode-pixel-office install
```
**What this does:**
-   Copies the Pixel Office app to `~/.opencode/pixel-office`.
-   Installs production dependencies in that folder.
-   Installs the `pixel-office.js` plugin to `~/.opencode/plugins/`, which OpenCode automatically loads.

### Step 3: Start OpenCode
Now, simply open your OpenCode IDE.
-   Pixel Office will **automatically start** a local server.
-   It will **open your browser** to [http://localhost:5100](http://localhost:5100).
-   You will see your agent's thoughts and actions visualized in real-time!

---

## 🛠️ For Developers

If you want to contribute to Pixel Office or modify the source code:

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/your-username/pixel-opencode.git
    cd pixel-opencode
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Start Development Servers**:
    -   **Server**: `npm start` (Runs on port 5100)
    -   **Client**: `npm run dev:client` (Vite dev server)

4.  **Install Local Plugin**:
    ```bash
    mkdir -p ~/.opencode/plugins
    cp plugin/pixel-office.js ~/.opencode/plugins/
    ```
    *Note: When you open this repository in OpenCode, the plugin automatically detects the local `server/` folder and uses it instead of the global installation.*
