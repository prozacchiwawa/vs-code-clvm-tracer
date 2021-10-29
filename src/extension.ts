import * as vscode from 'vscode';
import * as fs from 'fs';
import { parse, stringify } from 'yaml';
import { trace } from 'console';
import { privateEncrypt } from 'crypto';

const match_srcloc = /^([^()]+)[(]([0-9]+)[)]:([0-9]+)(-([^()]+)[(]([0-9]+)[)]:([0-9]+))?$/;

class TraceEntry {
	entry: any;
	idx = 0;
	label = "";
	file = "";
	line = 0;
	col = 0;
	until_line = 0;
	until_col = 0;
	content = "";

	takeUntil(matched: RegExpMatchArray) {
		// 5 - repeated file name
		this.until_line = parseInt(matched[6]);
		this.until_col = parseInt(matched[7]);
	}

	constructor(i: number, entry: any) {
		this.idx = i;

		this.entry = entry;
		delete this.entry.Env;
		if (entry['Operator'] === '2') {
			delete this.entry.Arguments;
		}
		this.content = stringify(this.entry);

		const oploc = entry['Operator-Location'];
		const resloc = entry['Result-Location'];
		let matched: RegExpMatchArray|undefined = undefined;

		try {
			if (resloc) {
				matched = resloc.match(match_srcloc);
			}
			if (!matched && oploc) {
				matched = oploc.match(match_srcloc);
			}
			if (matched) {
				this.file = matched[1];
				this.line = parseInt(matched[2]);
				this.col = parseInt(matched[3]);
				this.takeUntil(matched);
			}
		} catch(e) {
			this.file = '*error-parsing-srcloc*';
			this.line = 0;
			this.col = 0;
			this.until_line = 0;
			this.until_col = 0;
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('catCoding.start', () => {
			const tracetext = vscode.window.activeTextEditor?.document.getText();
			const trace_entries: Array<TraceEntry> = [];
			let file = "";
			const filecontent: Array<string> = [];
			let parsed_yaml: Array<any> = [];
			
			console.log(tracetext);
			if (tracetext) {
				console.log('parsing yaml');
				try {
					const yaml_result = parse(tracetext);
					if (yaml_result) {
						parsed_yaml = yaml_result;
					} else {
						parsed_yaml = [];
					}
				} catch(e) {
					console.log(e);
				}
			}

			const iters = parsed_yaml.length;
			for (let i = 0; i < iters; i++) {
				const entry = new TraceEntry(i, parsed_yaml[i]);
				trace_entries[i] = entry;
				if (entry.file && entry.file.charAt(0) != '*' && file === '') {
					file = entry.file;
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
							CatCodingPanel.createOrShow(context.extensionUri, trace_entries, file, split);
						}
					});
				}
			}
		})
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(CatCodingPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(`Got state: ${state}`);
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				CatCodingPanel.revive(webviewPanel, context.extensionUri, state.trace, state.file, state.content);
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
	private readonly _file: string = "";
	private _rendered = false;
	private _enqueued: Array<any>|null = [];
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, traceData: Array<TraceEntry>, file: string, filecontent: Array<string>) {
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

		CatCodingPanel.currentPanel = new CatCodingPanel(panel, extensionUri, traceData, file, filecontent);
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, traceData: Array<TraceEntry>, file: string, fileContent: Array<string>) {
		CatCodingPanel.currentPanel = new CatCodingPanel(panel, extensionUri, traceData, file, fileContent);
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

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, traceData: Array<TraceEntry>, file: string, filecontent: Array<string>) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._traceData = traceData;
		this._filecontent = filecontent;
		this._file = file;

		const messageData = {
			"trace": this._traceData,
			"content": this._filecontent,
			"file": this._file
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
			const html = fs.readFileSync(indexPath.fsPath).toString('utf-8').
				replace(/@@NONCE@@/g, nonce).
				replace(/@@SCRIPT@@/g, script);
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
