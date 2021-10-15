const vscode = acquireVsCodeApi();

import * as React from 'react'
import { render } from 'react-dom'

import { createElmishComponent } from '@ts-elmish/react'

function sender(dispatch,f) {
	return (e) => dispatch(f(e));
}

const LineOfCode = createElmishComponent({
	init: (l) => {
		return [l, []];
	},
	update: (state, action) => { return [state, []]; },
	view: state => {
		return <pre>{state.code}</pre>;
	}
});

const LinesOfCode = createElmishComponent({
	init: (arg) => {
		console.log('LinesOfCode', arg);
		return [{code: arg.code}, []];
	},
	update: (state, action) => { return [state, []]; },
	view: state => {
		return <div className='code'>
			<h1>Code</h1>
			{state.code.map((l) => { return <LineOfCode code={l} />; })}
		</div>;
	}
});

const TraceEntry = createElmishComponent({
	init: (l) => {
		return [l, []];
	},
	update: (state, action) => { return [state, []]; },
	view: state => {
		return <pre>{JSON.stringify(state.entry)}</pre>;
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
			{state.trace.map((l) => { return <TraceEntry entry={l} />; })}
		</div>
	}
});

const App = createElmishComponent({
	init: (code) => {
		console.log('App', code);
		return [code, []];
	},
	update: (state, action) => { 
		console.log(action);
		return [state, []]; 
	},
	view: state => {
		return <div id='root'>
			<Navigation trace={state.trace} />
			<LinesOfCode code={state.content} />
		</div>
	}
});

setTimeout(() => {
	console.log(vscode);
	vscode.postMessage({'data': 'started'});
}, 0);

let rendered = false;
window.addEventListener('message', (evt) => {
	console.log('window', evt);
	if (!rendered && evt.data.content) {
		// eslint-disable-next-line functional/no-expression-statement
		render(<App trace={evt.data.trace} content={evt.data.content} />, document.getElementById('app'));
	}
});
