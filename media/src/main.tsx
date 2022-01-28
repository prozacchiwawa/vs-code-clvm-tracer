const vscode = acquireVsCodeApi();

import * as React from 'react'
import { render } from 'react-dom'

import { createElmishComponent } from '@ts-elmish/react'
import { execPath } from 'process'
import * as bigint from 'big-integer'

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

const HashTreeEntry = createElmishComponent({
	init: (code) => {
		return [code, []];
	},
	update: (state, action) => {
		return [state, []];
	},
	view: (state) => {
		const thisEntry = state.trace[state.idx];
		console.log({thisEntry});
		const argRefsText = thisEntry.entry['Argument-Refs'];
		console.log({argRefsText});
		let valueBigint;
		try {
			valueBigint = bigint(thisEntry.entry.Value ? thisEntry.entry.Value : 0);
		} catch (e) {
			valueBigint = bigint(0);
		}
		if (valueBigint.leq(bigint(-1))) {
			let length = valueBigint.bitLength();
			const mod8 = length.mod(8);
			if (mod8.neq(bigint(0))) {
				length = length.plus(bigint(8).minus(mod8));
			}
			const subfrom = bigint(1).shiftLeft(length);
			valueBigint = subfrom.plus(valueBigint);
		}
		const hexParsed = "0x" + valueBigint.toString(16);
		console.log({hexParsed});
		const argRefs = argRefsText ? argRefsText.split(',').map((e) => parseInt(e.trim())) : [];
		console.log({argRefs});
		const references =
			argRefs ? 
			<div>
				{argRefs.map((i) => <HashTreeEntry idx={i} trace={state.trace} parent={state.parent}/>)}
			</div> : <div></div>;

		console.log({references});
		return <div className="hash-tree-entry">
			<div>Value Tree Entry</div>
			<div>Hex: {hexParsed}</div>
			<div>Value: {thisEntry.entry.Value}</div>
			<div>Arguments: {thisEntry.entry.Arguments}</div>
			{references}
		</div>;
	}
});

const HashView = createElmishComponent({
	init: (code) => {
		return [code, []];
	},
	update: (state,action) => {
		return [state, []];
	},
	view: state => {
		return <div>
			<HashTreeEntry idx={state.idx} trace={state.trace} parent={state.parent} />
		</div>;
	}
});

const App = createElmishComponent({
	init: (code) => {
		return [code, []];
	},
	update: (state, action) => {
		console.log(action);
		if (action[0].select) {
			return [{
        		pane: state.pane,
				selection: action[0].select,
				trace: state.trace,
				content: state.content
			}, []];
		} else if (action[0].setpane !== undefined) {
			return [{
				pane: action[0].setpane,
				selection: state.selection,
				trace: state.trace,
				content: state.content
			}, []];
		}
		console.log('App', state);
		return [state, []];
	},
	view: state => {
		console.log('selection', JSON.stringify(state.selection));
		let contentPane;
		if (state.pane) {
			contentPane = <HashView idx={state.selection.idx} trace={state.trace} parent={state.dispatch} />;
		} else {
			contentPane = <LinesOfCode selection={state.selection} file={state.file} code={state.content} />;
		}
		const sourcePaneStyle = `source-pane tab-selected-${!state.pane}`;
		const hashPaneStyle = `hash-pane tab-selected-${state.pane}`;
		return <div id='root'>
			<div className='tab-heading'>
				<button onClick={() => {state.dispatch([{setpane: false}])}} className={sourcePaneStyle}>Source</button>
				{state.selection ? <button onClick={() => {state.dispatch([{setpane: true}])}} className={hashPaneStyle}>Value tree</button> : <button disabled={true} className="inactive-hash-pane">Hash trace: no selection</button>}
			</div>
			<div className='root-content'>
				<Navigation selection={state.selection} trace={state.trace} parent={state.dispatch} />
				{contentPane}
			</div>
		</div>
	}
});

let rendered = false;
function renderView(state) {
	vscode.setState(state);
	// eslint-disable-next-line functional/no-expression-statement
	render(<App pane={false} file={state.file} trace={state.trace} content={state.content} />, document.getElementById('app'));
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
