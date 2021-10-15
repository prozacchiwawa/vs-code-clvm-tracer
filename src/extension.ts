import * as vscode from 'vscode';
import * as fs from 'fs';
import { trace } from 'console';

class TraceEntry {
	file: string;
	line: number;
	col: number;
	arglist: string;
	outcome: string;

	constructor(file: string, line: number, col: number, arglist: string, outcome: string) {
		this.file = file;
		this.line = line;
		this.col = col;
		this.arglist = arglist;
		this.outcome = outcome;
	}
}

function parse_line(s: string): TraceEntry|undefined {
	const trimmed = s.trim();
	if (trimmed.length == 0) {
		return;
	}

	const match_re = /[(]"([^()]+)[(]([0-9]+)[)]:([0-9]+).*".*[)] => (.*).*/;
	const matched_trim = trimmed.match(match_re);

	if (matched_trim) {
		return new TraceEntry(matched_trim[1], +matched_trim[2], +matched_trim[3], "", matched_trim[4]);
	}
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('catCoding.start', () => {
			const tracetext = vscode.window.activeTextEditor?.document.getText();
			const lines = tracetext?.split('\n');
			const trace_lines = lines ? lines : [];
			const trace_entries: Array<TraceEntry> = [];
			const iters = lines ? lines.length : 0;
			let file = "";
			const filecontent: Array<string> = [];

			for (let i = 1; i < iters; i++) {
				const traced = parse_line(trace_lines[i]);
				if (traced) {
					file = traced.file;
					trace_entries.push(traced);
				}
			}

			if (file.length > 0) {
				const workspaceFolder = vscode.workspace.workspaceFolders;
				if (workspaceFolder) {
					const path = workspaceFolder[0].uri;
					const filename = path.with({ path: path.fsPath + "/" + file });
					console.log(filename);
					vscode.workspace.fs.readFile(filename).then((f) => {
						let fdata = "";
						for (let idx = 0; idx < f.length; idx++) {
							fdata += String.fromCharCode(f[idx]);
						}
						const split = fdata.split('\n');
						if (split) {
							CatCodingPanel.createOrShow(context.extensionUri, trace_entries, split);
						}
					});
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('catCoding.doRefactor', () => {
			console.log('doRefactor');
		})
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(CatCodingPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(`Got state: ${state}`);
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				CatCodingPanel.revive(webviewPanel, context.extensionUri);
			}
		});
	}
}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,

		// And restrict the webview to only loading content from our extension's `media` directory.
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
	};
}

/**
 * Manages cat coding webview panels
 */
class CatCodingPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: CatCodingPanel | undefined;

	public static readonly viewType = 'catCoding';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _traceData: Array<TraceEntry>;
	private readonly _filecontent: Array<string>;
	private _rendered = false;
	private _enqueued: Array<any>|null = [];
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, traceData: Array<TraceEntry>, filecontent: Array<string>) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (CatCodingPanel.currentPanel) {
			CatCodingPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			CatCodingPanel.viewType,
			'CLVM Trace',
			column || vscode.ViewColumn.One,
			getWebviewOptions(extensionUri),
		);

		CatCodingPanel.currentPanel = new CatCodingPanel(panel, extensionUri, traceData, filecontent);
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		CatCodingPanel.currentPanel = new CatCodingPanel(panel, extensionUri, [], []);
	}

	private spillMessages() {
		if (this._enqueued === null) {
			return;
		}

		const enqueued = this._enqueued;
		this._enqueued = null;
		for (let i = 0; i < enqueued.length; i++) {
			this._panel.webview.postMessage(enqueued[i]);
		}
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, traceData: Array<TraceEntry>, filecontent: Array<string>) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._traceData = traceData;
		this._filecontent = filecontent;

		const messageData = {
			"trace": this._traceData,
			"content": this._filecontent
		};

		console.log('sending start message');
		this._enqueueOrSend(messageData);

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			e => { console.log('changeViewState'); },
			null,
			this._disposables
		);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				console.log(message);
				this._enqueueOrSend({"test":"test"});
				this.spillMessages();
			},
			null,
			this._disposables
		);
	}

	public dispose() {
		CatCodingPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		// Vary the webview's content based on where it is located in the editor.
		if (!this._rendered) {
			this._panel.title = 'CLVM Trace';
			this._panel.webview.html = this._getHtmlForWebview();
		}
	}

	private _enqueueOrSend(data: any) {
		if (this._enqueued === null) {
			this._panel.webview.postMessage(data);
		} else {
			this._enqueued.push(data);
		}
	}

	private _getHtmlForWebview(): string {
		const scriptPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'out', 'main.js');
		const indexPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'out', 'index.html');

		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();

		try {
			const script = fs.readFileSync(scriptPath.fsPath).toString('base64');
			console.log(script);
			const html = fs.readFileSync(indexPath.fsPath).toString('utf-8').
				replace(/@@NONCE@@/g, nonce).
				replace(/@@SCRIPT@@/g, script);
			console.log('read file',indexPath,html);
			return html;
		} catch(e) {
			return `<html><body><h1>Error ${e}</h1></body></html>`;
		}
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
