import readlineSync from 'readline-sync';
import chalk from 'chalk';

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function log(type, message) {
    const timestamp = new Date().toLocaleTimeString();
    switch (type.toLowerCase()) {
        case 'info':
            console.log(`${chalk.dim(`[${timestamp}]`)} ${chalk.blue('[INFO]')} ${message}`);
            break;
        case 'success':
            console.log(`${chalk.dim(`[${timestamp}]`)} ${chalk.green('[SUCCESS]')} ${message}`);
            break;
        case 'error':
            console.log(`${chalk.dim(`[${timestamp}]`)} ${chalk.red('[ERROR]')} ${message}`);
            break;
        case 'warning':
            console.log(`${chalk.dim(`[${timestamp}]`)} ${chalk.yellow('[WARNING]')} ${message}`);
            break;
        default:
            console.log(`${chalk.dim(`[${timestamp}]`)} ${message}`);
    }
}

export function askQuestion(query) {
    return readlineSync.question(query);
}

export function clearTerminal() {
    console.clear();
}
