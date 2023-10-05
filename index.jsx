// @jsx h
// @jsxFrag Fragment

import { h, render, Fragment } from "preact";
import { useState } from "preact/hooks";

console.log("Hello world!");

const Counter = () => {
    let [count, setCount] = useState(0);

    let increment = () => {
        setCount(count + 1);
    };

    return <button onClick={increment}>{count}</button>;
};

const App = () => {
    return (
        <>
            <h1>Hello World!</h1>
            <div className="counter-container">
                <Counter />
                <Counter />
            </div>
        </>
    );
};

render(<App />, document.getElementById("root"));
