// @jsx h
// @jsxFrag Fragment

import { h, render, Fragment } from "https://esm.sh/preact@10.18.1";
import { useState } from "https://esm.sh/preact@10.18.1/hooks";

console.log("Hello world!");

const Button = () => {
    let [count, setCount] = useState(0);

    let increment = () => {
        setCount(count + 1);
    };

    return <button onClick={increment}>Count: {count}</button>;
};

const App = () => {
    return (
        <>
            <h1>Hello World!</h1>
            <Button />
        </>
    );
};

render(<App />, document.getElementById("root"));
