const _ = require('lodash');
const SchedulingAlgorithm = require('./scheduling-algorithm.js');
const LinkedList = require('dbly-linked-list');
const pf = require('pareto-frontier');
const MultiMap = require("collections/multi-map");
const fs = require('fs');
const RankUtilities = require('./rank-utilities.js');
const MOHEFT = require('./moheft.js');

class MOHEFT_LOSS extends SchedulingAlgorithm {
    constructor(config) {
        super(config);
    }

    decorateStrategy(dag) {
        const tasks = dag.tasks;

        this.decorateTasksWithLevels(tasks);
        const sortedTasks = tasks.sort((task1, task2) => task1.level - task2.level);

        const maxDeadline = this.costFunctions.maxDeadline(tasks);
        const minDeadline = this.costFunctions.minDeadline(tasks);

        const maxBudget = this.costFunctions.maxBudget(tasks);
        const minBudget = this.costFunctions.minBudget(tasks);

        const userDeadline = this.calculateUserDeadline(maxDeadline, minDeadline);
        const userBudget = this.calculateUserBudget(maxBudget, minBudget);

        console.log("Max budget: " + maxBudget);
        console.log("Min budget: " + minBudget);
        console.log("Max deadline: " + maxDeadline);
        console.log("Min deadline: " + minDeadline);

        console.log("userDeadline: " + userDeadline);
        console.log("userBudget: " + userBudget);

        RankUtilities.decorateTasksWithUpwardRank(sortedTasks, this.config.functionTypes);

        let moheft = new MOHEFT(this.config, 10, false);
        let paretoPoints = moheft.decorateStrategy(dag);
        console.log(paretoPoints);

        console.log("Solutions: ");
        let timeSolutions = [];
        for (const paretoPoint of paretoPoints) {
            if (paretoPoint[0] <= userDeadline) {
                timeSolutions.push(paretoPoint[2]);
            }
        }

        const tasksSortedUpward = tasks.sort((task1, task2) => task2.upwardRank - task1.upwardRank);
        let map = this.createMapOfTaskResourceTimeCost(tasksSortedUpward);

        let solutionsWithTimeAndCost = [];
        for (const timeSolution of timeSolutions) {
            let weights = this.createWeights(map, timeSolution);
            for (let i = 0; i < weights.length; i++) {
                if (this.getExecutionCostOfSchedule(timeSolution) < userBudget) {
                    solutionsWithTimeAndCost.push([this.getExecutionTimeOfSchedule(timeSolution), this.getExecutionCostOfSchedule(timeSolution)]);
                    console.log("Found!");
                    console.log(this.getExecutionCostOfSchedule(timeSolution));
                    console.log(this.getExecutionTimeOfSchedule(timeSolution));
                    break;
                }


                let taskId = weights[i].taskId;
                let taskFromSchedule = timeSolution.tasks.filter(task => task.config.id === taskId)[0];
                taskFromSchedule.config.deploymentType = weights[i].functionType;
                let newCost = this.getExecutionCostOfSchedule(timeSolution);
                if (newCost < userBudget) {
                    console.log("Found!");
                    console.log(newCost);
                    console.log(this.getExecutionTimeOfSchedule(timeSolution));
                    solutionsWithTimeAndCost.push([this.getExecutionTimeOfSchedule(timeSolution), newCost]);
                    break;
                }

            }
        }


        console.log("Number of solutions: " + solutionsWithTimeAndCost.length);
        let filePath = './outputs_multiple/all_' + this.config.workflow + '.txt';
        for (const paretoPoint of solutionsWithTimeAndCost) {
            fs.appendFileSync(filePath, paretoPoint[0] + ' , ' + paretoPoint[1] + ',' + 'moheft-loss' + ','
                + this.config.deadlineParameter + ',' + this.config.budgetParameter + ',' + userDeadline + ',' + userBudget + '\n');
        }
    }

    createMapOfTaskResourceTimeCost(tasksSortedUpward) {
        let map = new Map();
        for (const task of tasksSortedUpward) {
            for (const functionType of this.config.functionTypes) {
                map.set([task.config.id, functionType], [task.finishTime[functionType] - task.startTime[functionType], this.taskUtils.findTaskExecutionCostOnResource(task, functionType)]);
            }
        }
        return map;
    }

    createWeights(map, timeSolution) {
        let weights = [];
        for (const mapElement of map) {
            let taskId = mapElement[0][0];
            let functionType = mapElement[0][1];
            let time = mapElement[1][0];
            let cost = mapElement[1][1];

            let taskFromSchedule = timeSolution.tasks.filter(task => task.config.id === taskId)[0];
            let deploymentType = taskFromSchedule.config.deploymentType;

            if (deploymentType === functionType) {
                weights.push({'functionType': functionType, 'weight': 0, 'taskId': taskId});
                continue;
            }

            let allTasksFromLevel = this.taskUtils.findTasksFromLevel(timeSolution.tasks, taskFromSchedule.level);
            let levelCost = allTasksFromLevel.map(task => this.taskUtils.findTaskExecutionCostOnResource(task, task.config.deploymentType)).reduce((a, b) => a + b);
            let allExecutionTimesFromLevel = allTasksFromLevel.map(task => this.taskUtils.findTaskExecutionTimeOnResource(task, task.config.deploymentType));
            let timeOfLevel = Math.max(...allExecutionTimesFromLevel);

            let newLevelCost = levelCost - this.taskUtils.findTaskExecutionCostOnResource(taskFromSchedule, taskFromSchedule.config.deploymentType) + cost;


            let tasksWithoutOneInQuestion = allTasksFromLevel.filter(task => task.config.id !== taskId);
            let levelTimeWithoutNewDeployment = Math.max(...tasksWithoutOneInQuestion.map(task => this.taskUtils.findTaskExecutionTimeOnResource(task, task.config.deploymentType)));
            let newLevelTime = Math.max(levelTimeWithoutNewDeployment, time);

            let weight = (timeOfLevel - newLevelTime) / (newLevelCost - levelCost);

            weights.push({'functionType': functionType, 'weight': weight, 'taskId': taskId});
        }
        return weights.sort((a, b) => (a.weight - b.weight));
    }

    addDistances(sorted, property) {
        let maxValue = sorted.getTailNode().getData()[property];
        let minValue = sorted.getHeadNode().getData()[property];
        sorted.getTailNode().getData().distance = Infinity;
        sorted.getHeadNode().getData().distance = Infinity;
        let element = sorted.getHeadNode();
        while (element !== undefined && element.hasNext()) {
            if (element.getData().distance === Infinity) {
                element = element.next;
                continue;
            }

            let delta = element.next.getData()[property] - element.prev.getData()[property];
            element.getData().distance = delta / (maxValue - minValue);
            element = element.next;
        }
    }

    getExecutionCostOfSchedule(newSchedule) {
        let totalCost = 0;
        let tasks = newSchedule.tasks;
        for (const task of tasks) {
            if (task.config.deploymentType !== undefined) {
                totalCost += this.taskUtils.findTaskExecutionCostOnResource(task, task.config.deploymentType)
            }
        }
        return totalCost;
    }

    computeSubDeadline(tasks, task, userDeadline) {
        // Path do exit task??
        let successors = tasks.filter(x => x.level === task.level + 1);

        if (successors.length === 0) {
            task.subDeadline = userDeadline;
        } else {
            let successorSubDeadlines = successors.map(x => this.findOrComputeSubDeadline(tasks, x, userDeadline));
            task.subDeadline = Math.min(...successorSubDeadlines);
        }

        return task.subDeadline;
    }

    findOrComputeSubDeadline(tasks, task, userDeadline) {
        let minExecutionTime = this.taskUtils.findMinTaskExecutionTime(task);
        let subDeadline;
        let originalTask = tasks.find(x => x.config.id === task.config.id);
        if (originalTask.subDeadline === undefined) {
            subDeadline = this.computeSubDeadline(tasks, originalTask, userDeadline);
        } else {
            subDeadline = originalTask.subDeadline;
        }
        // Average communication time = 0
        return (subDeadline - minExecutionTime);
    }


    minDeadline(tasks) {
        let allExecutionTimes = [];
        let maximumLevel = this.taskUtils.findTasksMaxLevel(tasks);
        for (let i = 1; i <= maximumLevel; i++) {
            let minimumForLevel = Math.max(...tasks.filter(task => task.level === i).map(task => this.taskUtils.findMinTaskExecutionTime(task)));
            allExecutionTimes.push(minimumForLevel);
        }
        return allExecutionTimes.reduce(function (a, b) {
            return a + b
        }, 0)
    }

    getExecutionTimeOfSchedule(newSchedule) {
        let allExecutionTimes = [];
        let tasks = newSchedule.tasks;
        let maximumLevel = this.taskUtils.findTasksMaxLevel(tasks);
        for (let i = 1; i <= maximumLevel; i++) {
            let timesForLevel = tasks.filter(task => task.level === i)
                .filter(task => task.config.deploymentType !== undefined)
                .map(task => task.finishTime[task.config.deploymentType] - task.startTime[task.config.deploymentType]);


            if (timesForLevel.length > 0) {
                let minimumForLevel = Math.max(...timesForLevel);
                allExecutionTimes.push(minimumForLevel);
            }
        }
        return allExecutionTimes.reduce(function (a, b) {
            return a + b
        }, 0);


        //
        //
        // const tasks = newSchedule.tasks;
        // let totalTime = 0;
        // let maximumLevel = this.taskUtils.findTasksMaxLevel(tasks);
        //
        // for (const level of _.range(maximumLevel)) {
        //     let timeOfLevel = 0;
        //     for (const task of this.taskUtils.findTasksFromLevel(tasks, level)) {
        //         let deploymentType = task.config.deploymentType;
        //         if (deploymentType !== undefined) {
        //             timeOfLevel = Math.max(timeOfLevel, task.finishTime[deploymentType] - task.startTime[deploymentType])
        //         }
        //     }
        //     totalTime += timeOfLevel;
        // }
        // return totalTime;
    }
}

module.exports = MOHEFT_LOSS;