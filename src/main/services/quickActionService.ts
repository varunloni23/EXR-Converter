import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { logger } from './logger';

export class QuickActionService {
  public static ensureMacQuickActions(): void {
    if (process.platform !== 'darwin') return;

    try {
      const servicesDir = path.join(os.homedir(), 'Library', 'Services');
      if (!fs.existsSync(servicesDir)) {
        fs.mkdirSync(servicesDir, { recursive: true });
      }

      // Check if all 4 required workflows exist
      const requiredWorkflows = [
        'Convert to MOV.workflow',
        'Convert to JPEG.workflow',
        'Compare Folders.workflow',
        'Remove Gemini Watermark.workflow',
      ];

      const legacyWorkflows = [
        'Convert to MP4 with EXR Converter.workflow',
        'Convert to MOV (Single Video, 40Mbps).workflow',
        'Convert to JPEG with EXR Converter.workflow',
        'Compare Folders with EXR Converter.workflow',
        'Remove Watermark.workflow',
      ];

      for (const legacy of legacyWorkflows) {
        const p = path.join(servicesDir, legacy);
        if (fs.existsSync(p)) {
          try {
            fs.rmSync(p, { recursive: true, force: true });
          } catch {}
        }
      }

      const allExist = requiredWorkflows.every((name) =>
        fs.existsSync(path.join(servicesDir, name, 'Contents', 'Info.plist')) &&
        fs.existsSync(path.join(servicesDir, name, 'Contents', 'document.wflow'))
      );

      if (allExist) {
        return; // Already registered and intact
      }

      logger.info('Registering macOS Finder Quick Actions...');
      this.createWorkflow(servicesDir, {
        workflowName: 'Convert to MOV.workflow',
        menuItemName: 'Convert to MOV',
        format: 'mov',
        mode: 'sequence',
      });
      this.createWorkflow(servicesDir, {
        workflowName: 'Convert to JPEG.workflow',
        menuItemName: 'Convert to JPEG',
        format: 'jpg',
        mode: 'individual',
      });
      this.createWorkflow(servicesDir, {
        workflowName: 'Compare Folders.workflow',
        menuItemName: 'Compare Folders',
        isCompare: true,
      });
      this.createWorkflow(servicesDir, {
        workflowName: 'Remove Gemini Watermark.workflow',
        menuItemName: 'Remove Gemini Watermark',
        isWatermark: true,
      });

      try {
        execSync('/System/Library/CoreServices/pbs -flush 2>/dev/null || true');
        execSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user 2>/dev/null || true');
      } catch {}
      logger.info('Finder Quick Actions registered successfully.');
    } catch (err) {
      logger.warn('Failed to ensure macOS Quick Actions', err instanceof Error ? err.message : String(err));
    }
  }

  private static createWorkflow(
    servicesDir: string,
    opts: {
      workflowName: string;
      menuItemName: string;
      format?: string;
      mode?: string;
      isCompare?: boolean;
      isWatermark?: boolean;
    }
  ): void {
    const workflowPath = path.join(servicesDir, opts.workflowName);
    const contentsDir = path.join(workflowPath, 'Contents');
    fs.mkdirSync(contentsDir, { recursive: true });

    const infoPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSIconName</key>
	<string>NSTouchBarPlay</string>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSBackgroundColorName</key>
			<string>background</string>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>${opts.menuItemName}</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSRequiredContext</key>
			<dict>
				<key>NSApplicationIdentifier</key>
				<string>com.apple.finder</string>
			</dict>
			<key>NSSendFileTypes</key>
			<array>
				<string>public.item</string>
			</array>
		</dict>
	</array>
</dict>
</plist>`;

    fs.writeFileSync(path.join(contentsDir, 'Info.plist'), infoPlistContent, 'utf8');

    const modeArg = opts.mode ? `--mode ${opts.mode}` : '';
    const flag = opts.isWatermark
      ? '--background --watermark'
      : opts.isCompare
      ? '--compare'
      : `--background --format ${opts.format} ${modeArg}`;

    const scriptBody = `unset ELECTRON_RUN_AS_NODE
echo "=== [$(date)] ${opts.menuItemName} triggered with args: $@ ===" >> /tmp/exr_quickaction.log
if [ -d "/Applications/EXR Converter.app" ]; then
    "/Applications/EXR Converter.app/Contents/MacOS/EXR Converter" ${flag} "$@" &
else
    npx electron . ${flag} "$@" &
fi`;

    const escapedScript = scriptBody
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const documentWflowContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>${escapedScript}</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/bash</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
					<string>Command</string>
					<string>Run</string>
					<string>Unix</string>
				</array>
				<key>OutputUUID</key>
				<string>B2C3D4E5-F6A7-4B8C-9D0E-1F2A3B4C5D6E</string>
				<key>UUID</key>
				<string>C3D4E5F6-A7B8-4C9D-0E1F-2A3B4C5D6E7F</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict>
					<key>0</key>
					<dict>
						<key>default value</key>
						<integer>0</integer>
						<key>name</key>
						<string>inputMethod</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>value</key>
						<integer>1</integer>
					</dict>
					<key>1</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>source</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>value</key>
						<string></string>
					</dict>
					<key>2</key>
					<dict>
						<key>default value</key>
						<false/>
						<key>name</key>
						<string>CheckedForUserDefaultShell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>value</key>
						<true/>
					</dict>
					<key>3</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>COMMAND_STRING</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>value</key>
						<string>${escapedScript}</string>
					</dict>
					<key>4</key>
					<dict>
						<key>default value</key>
						<string>/bin/sh</string>
						<key>name</key>
						<string>shell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>value</key>
						<string>/bin/bash</string>
					</dict>
				</dict>
				<key>isViewVisible</key>
				<integer>1</integer>
				<key>location</key>
				<string>309.000000:252.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>applicationBundleIDsByPath</key>
		<dict/>
		<key>applicationPaths</key>
		<array/>
		<key>inputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>outputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>presentationMode</key>
		<integer>15</integer>
		<key>processesInput</key>
		<false/>
		<key>serviceApplicationBundleID</key>
		<string>com.apple.finder</string>
		<key>serviceApplicationPath</key>
		<string>/System/Library/CoreServices/Finder.app</string>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<false/>
		<key>systemImageName</key>
		<string>NSTouchBarPlay</string>
		<key>useAutomaticInputType</key>
		<false/>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>`;

    fs.writeFileSync(path.join(contentsDir, 'document.wflow'), documentWflowContent, 'utf8');
  }
}
