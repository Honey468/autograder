
    var fb_log = FeedbackLog(world, 'task_4', 'Input 9 in given script', 0);

    var factorial_chunk = fb_log.newChunk('factorial', 'Factorial is a mathematical operation.')

    var basecase_tip = factorial_chunk.newTip('Make sure your basecase is correct, first.',
                                       'Your basecase is working well.');

    var scriptExists = function() {
                var template = '[{"blockSp":"when %greenflag clicked","inputs":[]},{"blockSp":"pen down","inputs":[]},{"blockSp":"repeat %n %c","inputs":["A",[{"blockSp":"move %n steps","inputs":["100"]},{"blockSp":"turn %clockwise %n degrees","inputs":["80"]}]]}]';
                var vars = ["A"];
                return scriptPresentInSprite(template, 0, vars);
            }
    var assertExists = basecase_tip.newAssertTest(scriptExists, 
        "Testing to see that the given script has been recreated exactly.",
        "Great job! You recreated the given script exactly.",
        "Your script does not match the given one. Double check it!",
        1);

    
    fb_log.runSnapTests(); 
    
    /****************************************************************************/
    /****************************************************************************/
    /************** Creating the Feedback Log ****************/
    /*
    * feedbackLog has a list of testChunks.
    */
    function FeedbackLog(snapWorld, taskID, feedback_text, numAttempts) {
    this.testCount = 0;
    this.allCorrect = false;
    this.currentTimeout = null;
    this.taskID = taskID || null;
    this.pScore = null;
    this.snapWorld = snapWorld || null;
    this.graded = false;
    this.numCorrect = 0;
    this.points = 0;
    this.totalPoints = 0;
    this.numAttempts = numAttempts || 0;

    this.chunk_list = [];
    this.num_errors = null;
    this.feedback_text = feedback_text || null;
    }

    FeedbackLog.prototype.updateCounts = function(num_tests, num_points) {
    this.testCount += num_tests;
    this.totalPoints += num_points;
    }

    /*
    * newChunk creates an empty chunk and immediately adds it to 
    * the feedbackLog chunk_list.
    */
    FeedbackLog.prototype.newChunk = function(chunk_title, chunk_text) {
    var new_chunk = new TestChunk(chunk_title, chunk_text);
    this.addChunk(new_chunk);
    return new_chunk;
    }

    /*
    * Add an existing chunk to the feedbackLog chunk_list. Update test
    * and point totals in the feedbackLog. Include a parent reference 
    * to the feedbackLog in the testChunk.
    */
    FeedbackLog.prototype.addChunk = function(chunk) {
    this.chunk_list.push(chunk);
    chunk.fb_log = this;
    this.updateCounts(chunk.testCount, chunk.totalPoints);

    }
    /******** Searching the FeedbackLog ********/

    FeedbackLog.prototype.chunkOf = function(tip) {
    if (tip.chunk) {
    return tip.chunk;
    } else {
    throw 'FeedbackLog.chunkOf: Tip has no Chunk';
    }
    };

    FeedbackLog.prototype.tipOf = function(test) {
    if (test.tip) {
    return test.tip;
    } else {
    throw 'FeedbackLog.tipOf: Test has no Tip';
    }
    }

    /******** Saving the FeedbackLog ***********/
    FeedbackLog.prototype.saveLog = function() {
    //Save current state as 'last attempt'
    var log_string = this.toString();
    sessionStorage.setItem(this.taskID + '_test_log', log_string);
    //Find previous 'best attempt', compare with current, if better, overwrite
    //Note: Holy Jesus. This predicate is rediculous. Brain hurts...
    var c_prev_log = JSON.parse(sessionStorage.getItem(this.taskID + "_c_test_log"));
    if (this.allCorrect || 
    ((this.pScore > 0) && 
        ((c_prev_log && (this.pScore >= c_prev_log.pScore)) || (!c_prev_log)))) {
    // Store the correct log in sessionStorage
    sessionStorage.setItem(this.taskID + "_c_test_log", log_string);
    }
    }

    FeedbackLog.prototype.saveSnapXML = function(store_key) {
    if (this.snapWorld && store_key) {
    sessionStorage.setItem(store_key, this.stringifySnapXML());
    }
    };

    FeedbackLog.prototype.stringifySnapXML = function() {
    if (this.snapWorld) {
    var ide = this.snapWorld.children[0];
    var world_string = ide.serializer.serialize(ide.stage);
    return world_string
    } else {
    throw 'FeedbackLog.stringifySnapXML: No snapWorld to found.';
    }
    };

    /************* Running the Feedback Log *************/

    FeedbackLog.prototype.runSnapTests = function() {
    //IE sucks: Can't use for...of until IE supports it.
    // Iterate over each chunk
    var chunk;
    var tip;
    var test;
    for (var c in this.chunk_list) {
    chunk = this.chunk_list[c]
    // Iterate over each tip in each chunk
    for (var t in chunk.tip_list) {
        tip = chunk.tip_list[t]
        // Iterate over each test in each tip
        for (var i in tip.test_list) {
            test = tip.test_list[i];
            if (test.testClass === 'r') {
                this.startSnapTest(test);
                return true;
            }
            if (test.testClass === 's') {
                return true;
            }
        }
    }
    }
    return false;
    };
    //NOTE: This function must now pass in a test.
    FeedbackLog.prototype.startSnapTest = function(test) {
    if (!test || !this.findTest(test)) {
    throw 'FeedbackLog.startSnapTest: Test not found';
    } else if (test.testClass !== 'r') {
    throw 'FeedbackLog.startSnapTest: Test is wrong type';
    }
    try {
    //Retrieve the block from the stage
    var block = null;
    if (test.isolated) {
        //TODO: Fix setUpIsolatedTest to remove testID
        block = setUpIsolatedTest(test.blockSpec, this, test)
    } else {
        block = getScript(test.blockSpec);
    }
    //Set the selected block's inputs for the test
    setValues(block, test.input);
    //Initiate the Snap Process with a callback to .finishSnapTest
    var stage = this.snapWorld.children[0].stage;
    var fb_log = this;  //to use in anonymous function
    var proc = stage.threads.startProcess(block,
        stage.isThreadSafe,
        false,
        function() {
            fb_log.finishSnapTest(test, readValue(proc));
        }
    );
    //Add reference to proc in gradingLog for error handling
    test.proc = proc;
    //Timeouts for infinitely looping script or an Error.
    var timeout = test.timeOut;
    if (timeout < 0) {
        timeout = 1000; //Set default if -1
    }
    //Launch timeout to handle Snap errors and infinitely looping scripts
    var timeout_id = setTimeout(function() {
        var stage = fb_log.snapWorld.children[0].stage;
        if (test.proc.errorFlag) {
            test.feedback = "Snap Error.";
        } else {
            test.feedback = "Test Timeout Occurred.";
        }
        test.output = "INVALID";
        stage.threads.stopProcess(getScript(test.blockSpec), test.sprite);
    }, timeout);
    this.currentTimeout = timeout_id;
    return this;
    } catch(e) {
    //If an error is throw, fill out the test info, and find the next test
    test.feedback = e;
    test.correct = false;
    test.graded = true;
    test.proc = null;
    //Find the next test and run it.
    runNextTest(test);

    }
    };

    FeedbackLog.prototype.finishSnapTest = function(test, output) {

    // Check that output is being returned
    if (!output) {
    test.output = null;
    } else {
    // If the output is a list, reformat it for comparision
    if (output instanceof List) {
        test.output = output.asArray();
    } else {
        test.output = output;
    }
    }
    var expOut = test.expOut;
    if (expOut instanceof Function) {
    //NOTE: This may not work if output is of 'bad' type
    test.correct = expOut(output);
    } else {
    if (expOut instanceof Array) {
        expOut = new List(expOut);
    }
    test.correct = snapEquals(output, expOut);
    }
    // Set feedback based on test.correct value
    if (test.correct) {
    test.feedback = test.feedback || "Test Passed.";
    } else {
    test.feedback = test.feedback || "Unexpected Output: " + String(output);
    }
    //Set test graded flag to true, for gradingLog.gradeLog()
    test.graded = true;
    //Kill error handling timeout
    clearTimeout(this.currentTimeout);
    test.proc = null;
    // Clear the input values
    try {
    if (test.isolated) {
        test.sprite.remove();
        test.sprite = null;
        var focus = this.snapWorld.children[0].sprites.contents[0];
        this.snapWorld.children[0].selectSprite(focus);
    } else {
        var block = getScript(test.blockSpec);
        setValues(block, Array(test['input'].length).join('a').split('a'));
    }
    } catch(e) {
    throw "gradingLog.finishSnapTest: Trying to clear values of block that does not exist.";
    }
    // Launch the next test if it exists, scoreLog otherwise.
    runNextTest(test);

    };

    FeedbackLog.prototype.runNextTest = function(test) {
    // Find teh next test
    var next_test = this.nextTest(test);
    var fb_log = this;
    if (next_test) {
    setTimeout(function() {
        fb_log.startSnapTest(next_test);
    }, 1);
    } else {
    this.scoreLog();
    return;
    }
    // if it exists, launch it with a timeout
    };
    //NOTE: May have an error if a tip has no test.
    FeedbackLog.prototype.nextTest = function(test) {
    var this_tip = this.tipOf(test);
    // Find the position of the test in the tip_list
    var test_index = this_tip.test_list.indexOf(test);
    // Find the next reporter test in the list and run it
    if ((this_tip.test_list.length - test_index) > 1) { //not last test
    return this_tip.test_list[test_index + 1];
    }
    // If it is the last test in the tip, find the next tip
    var this_chunk = this.chunkOf(this_tip);
    var tip_index = this_chunk.tip_list.indexOf(this_tip);
    if ((this_chunk.tip_list.length - tip_index) > 1) { //not last tip

    var next_tip = this_chunk.tip_list[tip_index + 1];

    if (next_tip.test_list.length > 0) { //only if next_tip has tests
        return next_tip.test_list[0];
    }
    }
    // If this is the last tip, find the next chunk
    var chunk_index = this.chunk_list.indexOf(this_chunk);
    if ((this.chunk_list.length - chunk_index) > 1) {

    var next_chunk = this.chunk_list[chunk_index + 1];

    if (next_chunk.tip_list.length > 0 &&
        next_chunk.tip_list[0].test_list.length > 0) {
        var next_test = next_chunk.tip_list[0].test_list[0];
        return next_test;
    }
    }
    return false;
    }

    FeedbackLog.prototype.firstTest = function() {
    if (this.chunk_list.length > 0 &&
    this.chunk_list[0].tip_list.length > 0 &&
    this.chunk_list[0].tip_list[0].test_list.length > 0) {
    return this.chunk_list[0].tip_list[0].test_list[0];
    }
    };
    //NOTE: This is depricated. 
    FeedbackLog.prototype.updateTest = function(testID, output, feedback, correct) {
    throw 'FeedbackLog.updateTest: This function is DEPRICATED.'
    };

    FeedbackLog.prototype.scoreLog = function() {
    if (this.testCount === 0) {
    throw 'FeedbackLog.scoreLog: Attempted to score empty FeedbackLog';
    }
    // Ensure that all tests have been graded.
    var test = this.firstTest();
    for (var i=0; i<this.testCount; i++) {
    if (!test.graded) {
        console.log('FeedbackLog.scoreLog: The log is not yet complete');
        return this;
    }
    //Continue to the next test otherwise
    test = this.nextTest(test);
    }

    // Iterate over all tests and score the FeedbackLog, chunks, and tips.
    this.allCorrect = true;
    var chunk,
    tip, 
    test;
    for (var c in this.chunk_list) { // for each chunk
    chunk = this.chunk_list[c];
    chunk.allCorrect = true;
    for (var t in chunk.tip_list) { // for each tip

        tip = chunk.tip_list[t];
        tip.allCorrect = true;
        for (var i in tip.test_list) { // for each test
            test = tip.test_list[i];
            if (test.correct) { // check if test passed,
                tip.numCorrect += 1;    // update count and points
                tip.points += test.points
            } else {
                tip.allCorrect = false;
            }
        }
        tip.graded = true;
        chunk.numCorrect += tip.numCorrect;
        chunk.points += tip.points;
        chunk.allCorrect &= tip.allCorrect //like '+='' but with booleans
    }
    chunk.graded = true;
    this.numCorrect += chunk.numCorrect;
    this.points += chunk.points;
    this.allCorrect &= chunk.allCorrect;
    }
    // Calculate percentage score (for edX partial credit)
    this.pScore = this.points / this.totalPoints;
    this.graded = true;
    this.numAttempts += 1; //increment the number of attempts when grading succeeds.
    // save the log 
    this.saveLog();
    // Update the Autograder Status Bar
    /**********/
    //TODO: UNCOMMENT AGFinish
    /**********/
    try {
    AGFinish(this);
    } catch(e) {
    console.log("WARNING: FeedbackLog.scoreLog, Can't find AGFinish.");
    }
    return this;
    };

    /************** Formatting the Feedback Log *****************/

    //NOTE: May not longer be necessary
    FeedbackLog.prototype.toDict = function() {
    throw 'FeedbackLog.toDict: This function is DEPRICATED.'
    // body...
    };

    FeedbackLog.prototype.toString = function() {
    var world_ref = this.snapWorld;
    this.SnapWorld = null;
    //Stringify the object with additional function to prevent cycles
    //Note: Borrowed from stack overflow
    //http://stackoverflow.com/questions/9382167/serializing-object-that-contains-cyclic-object-value
    seen = [];
    var log_string = JSON.stringify(this, function(key, val) {
    if (val != null && typeof val == "object") {
        if (seen.indexOf(val) >= 0) {
            return;
        }
        seen.push(val);
    }
    return val;
    }, ' ');
    // Restore the world reference
    this.snapWorld = world_ref;
    return log_string;
    };

    FeedbackLog.prototype.toAGLog = function() {
    throw 'FeedbackLog.toAGLog: This function is DEPRICATED.'
    // body...
    }

    /****************************************************************************/
    /****************************************************************************/
    /*
    * A testChunk is an object that contains all the tips (aka 'suggestions')
    * associated with a tested block/script. 
    */

    function TestChunk(chunk_title, chunk_text) {
    this.chunk_title = chunk_title;
    this.chunk_text = chunk_text || null;
    this.allCorrect = false;
    this.graded = false;
    this.testCount = 0;
    this.numCorrect = 0;
    this.totalPoints = 0;
    this.points = 0;
    this.tip_list = [];
    this.fb_log = null;
    }

    TestChunk.prototype.updateCounts = function(num_tests, num_points) {
    this.testCount += num_tests;
    this.totalPoints += num_points;
    if (this.fb_log) {
    this.fb_log.updateCounts(num_tests, num_points);
    }
    }

    TestChunk.prototype.newTip = function(suggestion, complement) {
    var new_tip = new Tip(suggestion, complement);
    this.addTip(new_tip);
    return new_tip;
    }

    TestChunk.prototype.addTip = function(tip) {
    tip.chunk = this;
    this.tip_list.push(tip);
    this.updateCounts(tip.testCount, tip.totalPoints)
    // this.testCount += tip.testCount;
    // this.totalPoints += tip.totalPoints;
    }

    /****************************************************************************/
    /****************************************************************************/

    function Tip(suggestion, complement) {
    this.suggestion = suggestion || 'Try Harder.';
    this.complement = complement || 'Good Job!';
    this.test_list = [];
    this.graded = false;
    this.testCount = 0;
    this.numCorrect = 0;
    this.totalPoints = 0;
    this.points = 0
    this.allCorrect = false;
    this.chunk = null;
    }

    Tip.prototype.updateCounts = function(num_tests, num_points) {
    this.testCount += num_tests;
    this.totalPoints += num_points;
    if (this.chunk) {
    this.chunk.updateCounts(num_tests, num_points);
    }
    }

    Tip.prototype.newIOTest = function(testClass, blockSpec, input, expOut, timeOut, isolated, points) {
    var new_io_test = new IOTest(testClass, blockSpec, input, expOut, timeOut, isolated, points);
    this.addTest(new_io_test);
    return new_io_test;
    }

    Tip.prototype.newAssertTest = function(statement, feedback, text, pos_fb, neg_fb, points) {
    var new_ass_test = new AssertTest(statement, feedback, text, pos_fb, neg_fb, points);
    this.addTest(new_ass_test);
    return new_ass_test
    }

    Tip.prototype.addTest = function(test) {
    this.test_list.push(test);
    test.tip = this;
    this.updateCounts(1, test.points);
    // this.testCount += 1;
    // this.totalPoints += test.points;
    }

    /****************************************************************************/
    /****************************************************************************/

    function IOTest(testClass, blockSpec, input, expOut, timeOut, isolated, points) {
    this.testClass = testClass;
    this.blockSpec = blockSpec;
    this.input = input;
    this.expOut = expOut;
    this.timeOut = timeOut;
    this.isolated = isolated || false;
    this.points = points || 0;

    this.output = null;
    this.correct = false;
    this.graded = false;
    this.feedback = null;
    this.proc = null;
    this.sprite = 0;
    }

    function AssertTest(statement, text, pos_fb, neg_fb, points) {
    this.testClass = 'a';
    this.assertion = statement;
    this.text = text;
    this.pos_fb = pos_fb;
    this.neg_fb = neg_fb;
    this.points = points || 0;

    this.correct = statement();
    if (this.correct) {
    this.feedback = pos_fb;
    } else {
    this.feedback = neg_fb;
    }
    this.graded = true;
    }

    /****************************************************************************/
    /****************************************************************************/
    /******************* Additional Functions *******************/

    //David's code for checking an array for inner arrays
    //then converting them to snap lists
    //a - the JS Array you want to check for inner Arrays
    // PROBABLY USELES AT THE MOMENT
    function checkArrayForList(a) {
    for (var i = 0; i < a.length; i++) {
    if (a[i] instanceof Array) {
        a[i] = new List(a[i]);
    }
    }
    }

    //David added in a way to populate a list in the
    //set values. Does not yet work for variables!
    function setValues(block, values) {
    if (!(values instanceof Array)) {
    values = [values];
    }
    var valIndex = 0,
    morphIndex = 0;

    if (block.blockSpec == "list %exp") {
    setNewListToArg(values[valIndex], block, morphIndex);
    return;
    }

    var morphList = block.children;

    for (var morph of morphList) {
    if (morph.constructor.name === "InputSlotMorph") {
        if (values[valIndex] instanceof Array) {
            setNewListToArg(values[valIndex], block, morphIndex);
        } else {
            morph.setContents(values[valIndex]);
        }
        valIndex += 1;
    } else if (morph instanceof ArgMorph && morph.type === "list") {
        setNewListToArg(values[valIndex], block, morphIndex);
        valIndex += 1;
    }
    morphIndex++;
    }
    if (valIndex + 1 !== values.length) {
    //TODO: THROW ERROR FOR INVALID BLOCK DEFINITION
    }
    }

    function evalReporter(block, outputLog, testID) {
    var stage = world.children[0].stage;
    var proc = stage.threads.startProcess(block,
                stage.isThreadSafe,
                false,
                function() {
                    outputLog.finishTest(testID, readValue(proc));
                });
    return proc
    }

    /* Read the return value of a Snap! process. The process
    * is an evaluating reporter block that updates a field in the
    * process on completion.
    */
    function readValue(proc) {
    return proc.homeContext.inputs[0];
    }

    function prettyBlockString(blockSpec, inputs) {
    var pString = blockSpec;
    for (var inp in inputs) {
    pString = pString.replace(/%[a-z]/, inp);
    }
    return pString;
    }

    /*
    *  Set a timeout for the test specified by testID and wait the appropriate time.
    *  If the test does not finish by the specified time out, find the process
    *  and kill it.
    */
    function infLoopCheck(outputLog, testID) {
    var timeout = outputLog["" + testID]["timeOut"];

    if (timeout < 0) {
    timeout = 1000;
    }
    return setTimeout(function() {
        var stage = world.children[0].stage;
        if (outputLog["" + testID]["proc"].errorFlag) {
            outputLog["" + testID]["feedback"] = "Error!";
        }
        stage.threads.stopProcess(getScript(outputLog["" + testID]["blockSpec"]));
    }, timeout);
    }

    /**************** Testing the Feedback Log ************/
    // Create a new feedbackLog
    var fb = new FeedbackLog(null, 'log_for_tests', 'this is a feedback log test', 0);
    console.log('fb created');
    // Create a first test chunk
    var test_chunk = fb.newChunk('factorial');
    console.log('test chunk created');
    console.log(test_chunk);
    // Add a first tip to that first test chunk
    var test_tip = test_chunk.newTip('Make sure that your basecase is correct.',
    'Your basecase looks great!');
    console.log('test tip created');
    // Add a first assertion test to that first tip
    var assertion1 = function() {
    return true;
    }
    var assertionBad = function() {
    return false;
    }
    var ass_test1 = test_tip.newAssertTest( 
    assertion1, 
    'The basecase should never have a recursive call.',
    'Your basecase correctly returns the simple solution.',
    'Careful, your basecase contains a recursive call.',
    2);
    console.log('assertion test created');
    // Add a second test to that first tip
    var ass_test2 = test_tip.newAssertTest(
    assertion1,
    'The color should be red',
    'The color is red!',
    'The color should always be red.',
    1);
    // Ad a second tip
    var second_tip = test_chunk.newTip('Make sure the cake is cooked.',
    'The cake is cooked perfectly!');
    // Add a test to that second tip
    var ass_test3 = second_tip.newAssertTest(
    assertionBad,
    'Cake does not have frosting',
    'The frosting is great!',
    'Cake must have frosting',
    1);

    // Create a second chunk
    var second_chunk = fb.newChunk('other stuff');
    var third_tip = second_chunk.newTip('yay you did it!',
    'Aww you didnt do it.');
    var ass_test4 = third_tip.newAssertTest(
    assertion1,
    'Bad job',
    'great job',
    'do a good job',
    1);

    // console.log('Saved the Log');
    console.log('Initial Log state');
    console.log(fb);
    fb.scoreLog();
    console.log('Log has been scored');
    console.log(fb)

















