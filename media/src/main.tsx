const vscode = acquireVsCodeApi();

import * as React from 'react'
import { render } from 'react-dom'

import { createElmishComponent } from '@ts-elmish/react'
import { execPath } from 'process';

function sender(dispatch,f) {
	return (e) => dispatch(f(e));
}

const LineOfCode = createElmishComponent({
	init: (l) => {
		return [l, []];
	},
	update: (state, action) => { return [state, []]; },
	view: state => {
		if (state.selection && state.selection.file == state.file) {
			const lineParts = [];
			if (state.selection.col >= 1) {
				lineParts.push(state.code.substring(0, state.selection.col - 1));
				let until = state.selection.col + 1;
				if (state.selection.until_col > state.selection.col) {
					until = state.selection.until_col;
				}
				lineParts.push(state.code.substring(state.selection.col - 1, until - 1));
				lineParts.push(state.code.substring(until - 1, state.code.length));
			} else {
				lineParts.push(state.code);
			}
			console.log(lineParts);
			return <div className='lineselected'>{lineParts.map((x,i) => {
				if (i === 1) {
					return <pre className='colsselected'>{x}</pre>;
				} else {
					return <pre className='colsnormal'>{x}</pre>;
				}
			})}</div>;
		} else {
			return <div className='lineunselected'><pre className='colsunselected'>{state.code}</pre></div>;
		}
	}
});

const selectedLine = (selection, n) => {
	if (!selection) { return null; }
	else if (selection.line === n + 1) {
		return selection;
	} else {
		return null;
	}
}

const LinesOfCode = createElmishComponent({
	init: (arg) => {
		console.log('LinesOfCode', arg);
		return [arg, []];
	},
	update: (state, action) => { return [state, []]; },
	view: state => {
		return <div className='code'>
			<h1>Code</h1>
			{state.code.map((l,i) => { return <LineOfCode file={state.file} selection={selectedLine(state.selection, i)} code={l} />; })}
		</div>;
	}
});

const TraceEntry = createElmishComponent({
	init: (l) => {
		return [l, []];
	},
	update: (state, action) => { 
		return [state, []]; 
	},
	view: state => {
		const classname = state.selected ? 'nav-item-selected' : 'nav-item';
		if (state.entry.file !== "") {
			return <span className={classname}><a onClick={() => {state.parent([{select:state.entry}])}}><pre className='selected-nav-color'>{state.entry.content}</pre></a></span>;
		} else {
			return <span className={classname}><pre className='nav-color'>{state.entry.content}</pre></span>;
		}
	}
});

const Navigation = createElmishComponent({
	init: (trace) => {
		return [trace, []];
	},
	update: (state, action) => { 
		return [state, []]; 
	},
	view: state => {
		return <div className='nav'>
			<h1>Expression</h1>
			{state.trace.map((l,idx) => {
				if (state.selection && state.selection.idx === l.idx) {
					console.log(this, state.selection);
					return <TraceEntry selected={true} entry={l} parent={state.parent} />; 
				} else {
					return <TraceEntry selected={false} entry={l} parent={state.parent} />;
				}
			})}
		</div>
	}
});

const App = createElmishComponent({
	init: (code) => {
		return [code, []];
	},
	update: (state, action) => { 
		if (action[0].select) {
			return [{
				selection: action[0].select,
				trace: state.trace,
				content: state.content
			}, []];
		}
		console.log('App', state);
		return [state, []];
	},
	view: state => {
		console.log('selection', JSON.stringify(state.selection));
		return <div id='root'>
			<Navigation selection={state.selection} trace={state.trace} parent={state.dispatch} />
			<LinesOfCode selection={state.selection} file={state.file} code={state.content} />
		</div>
	}
});

let rendered = false;
function renderView(state) {
	vscode.setState(state);
	// eslint-disable-next-line functional/no-expression-statement
	render(<App file={state.file} trace={state.trace} content={state.content} />, document.getElementById('app'));
}

setTimeout(() => {
	console.log(vscode);
	const state: any = vscode.getState();
	if (state && state.content) {
		renderView(state);
	} else {
		vscode.postMessage({'data': 'started'});
	}
}, 0);

window.addEventListener('message', (evt) => {
	console.log('window', evt);
	if (!rendered && evt.data.content) {
		renderView(evt.data);
	}
});
