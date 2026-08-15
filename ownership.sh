#!/bin/bash
# CodePipeline's native CodeDeploy action has no FileExistsBehavior option
# (only ApplicationName/DeploymentGroupName), so every deploy defaults to
# DISALLOW and fails the moment any file from a prior deploy already
# exists at the destination. Clearing it here, before Install copies the
# new revision in, means there's never anything to conflict with.
#
# Only public_html is touched -- the SQLite database lives at a sibling
# path (/home/tasksapp/data/tasks.db), outside this directory entirely,
# specifically so it survives every deploy untouched.
rm -rf /home/tasksapp/public_html/*
