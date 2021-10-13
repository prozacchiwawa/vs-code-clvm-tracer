const vscode = acquireVsCodeApi();

import * as React from 'react'
import { render } from 'react-dom'

import { createElmishComponent } from '@ts-elmish/react'

export const Effects = {
};

let e1 = document.createElement('h1');
e1.appendChild(document.createTextNode('foo'));
document.getElementById('app').appendChild(e1);


const App = createElmishComponent({
	init: () => [{count: 0}, []],
	update: (state, action) => [state, []],
	view: () => {
		return <h1>Hi there</h1>;
	}
});

// eslint-disable-next-line functional/no-expression-statement
render(<App />, document.getElementById('app'));