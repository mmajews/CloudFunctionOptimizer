

TMP_TIMES=./results/step2/montage_AWS_256_512_1024x5/tmp-times.json
DAG=./results/step2/montage_AWS_256_512_1024x5/dag-every_possible.json
CONFIG=./configuration/config.json 


N_PROCESS=$1

for i in `seq 0 $(($N_PROCESS - 1))`;
do
	nohup node app.js $TMP_TIMES $DAG $CONFIG $N_PROCESS $i > output$i.out&
done
