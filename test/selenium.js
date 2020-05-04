"use strict";

const { spawn } = require('child_process');
const { Builder, By, Key, until } = require('selenium-webdriver');
const Mocha = require('mocha');
const clipboardy = require("clipboardy");
const assert = require("assert");

const mocha = new Mocha();

mocha.addFile('test/selenium.js');
mocha.run(function(failures) {process.exitCode = failures? 1 : 0});

describe('IsoplotRgui', function testGui() {
    let rProcess;
    let driver;

    before(function() {
        rProcess = spawn('R', ['CMD', 'BATCH', 'test/start-gui.R', 'test/test.Rbatch']);
        driver = new Builder().forBrowser('firefox').build();
    });

    after(async function() {
        // unbelievably this has to be async to make Mocha wait until
        // all the tests have resolved before it calls it
        rProcess.kill('SIGHUP');
        driver.quit();
    })

    it('Undo', async function () {
        this.timeout(20000);
        await driver.get('http://localhost:50054');
        await testUndoInTable(driver);
    });

    it('Ages', async function testAges() {
        this.timeout(20000);
        await driver.get('http://localhost:50054');
        await driver.wait(until.elementLocated(cellInTable('INPUT', 1, 1)));
        await driver.wait(driver => tryToClearGrid(driver), 3000);
        const u235toU238 = 137.818;
        const testData = [
            ['25.2', '0.03', '0.0513', '0.0001'],
            ['25.4', '0.02', '0.0512', '0.0002'],
            ['27.1', '0.01', '0.05135', '0.00005']
        ];
        await inputTestData(driver, testData);
        const agesChoiceId = 'ui-id-9';
        await choosePlotDevice(driver, agesChoiceId);
        await clickButton(driver, 'run');
        const expectedResults = [
            [251.1, 0.51, 250.86, 0.29, 253.3, 4.48, 250.88, 0.29],
            [248.92, 0.88, 248.93, 0.19, 248.81, 8.99, 248.93, 0.19],
            [235.59, 0.22, 233.591, 0.085, 255.54, 2.24, 233.619, 0.085]
        ];
        await chainWithIndex(expectedResults, (row, rowNumber) =>
            chainWithIndex(row, (value, columnNumber) => {
            return driver.findElement(
                    cellInTable('OUTPUT', rowNumber + 1, columnNumber + 1)
                    ).getText().then(actual => {
                assertNearlyEqual(Number(actual), value);
            });
        }));
    });
});

function chainWithIndex(arr, callback, first=0, end=arr.length) {
    if (first < end) {
        return callback(arr[first], first).then(chainWithIndex(arr, callback, first + 1, end));
    }
    return new Promise(x => x, r => { throw r; });
}

function assertNearlyEqual(a, b) {
    const db = Math.abs(b * 1e-6) + 1e-12;
    assert(b - db < a && a < b + db, a + ' is not nearly ' + b);
}

async function choosePlotDevice(driver, choiceId) {
    // for some reason just clicking doesn't work
    const plotDeviceButton = await driver.findElement(By.id('plotdevice-button'));
    await driver.actions()
        .move({ origin: plotDeviceButton })
        .press()
        .release()
        .perform();
    const choice = await driver.findElement(By.id(choiceId));
    await driver.wait(until.elementIsVisible(choice));
    await driver.actions()
        .move({ origin: choice })
        .press()
        .release()
        .perform();
}

// Clicks 'Clear' button then reports if the grid (or at least the home cell)
// did get cleared.
async function tryToClearGrid(driver) {
    clickButton(driver, 'clear');
    const homeCell = driver.findElement(cellInTable('INPUT', 1, 1));
    return await homeCell.getText() === '';
}

async function testUndoInTable(driver) {
    await goToCell(driver, 'INPUT', 1, 1);
    const box = await driver.switchTo().activeElement();
    await box.sendKeys('13.2', Key.TAB);
    await driver.wait(until.elementTextContains(box,'13.2'));
    await goToCell(driver, 'INPUT', 1, 1);
    await box.sendKeys('7.54', Key.TAB);
    await driver.wait(until.elementTextContains(box,'7.54'));
    await box.sendKeys(Key.CONTROL, 'z');
    await driver.wait(until.elementTextContains(box,'13.2'));
    await box.sendKeys(Key.CONTROL, Key.SHIFT, 'z');
    await driver.wait(until.elementTextContains(box,'7.54'));
}

async function inputTestData(driver, testData) {
    await goToCell(driver, 'INPUT', 1, 1);
    const box = await driver.switchTo().activeElement();
    // write the first line in by typing it
    await box.sendKeys(testData[0][0], Key.TAB, testData[0][1], Key.TAB, testData[0][2], Key.TAB, testData[0][3], Key.RETURN);
    // write the other lines in by pasting them
    clipboardy.writeSync(testData.slice(1).map(ds => ds.join('\t')).join('\n'));
    await goToCell(driver, 'INPUT', 2, 1);
    const box2 = await driver.switchTo().activeElement();
    await box2.sendKeys(Key.CONTROL + 'v');
}

async function clickButton(driver, id) {
    await driver.findElement(By.id(id)).click();
}

async function goToCell(driver, tableId, row, column) {
    let cell = await driver.wait(until.elementLocated(cellInTable(tableId, row, column)));
    cell.click();
}

function cellInTable(tableId, row, column) {
    return By.css('#' + tableId + ' table tbody tr:nth-of-type(' + row + ') td:nth-of-type(' + column + ')');
}
