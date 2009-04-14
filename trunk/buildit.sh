TOOLBARID=activities@kaply.com
# The shortname of the extension
SHORTNAME=activities
rm  *.xpi
rm -rf $TOOLBARID
mkdir $TOOLBARID
cd $TOOLBARID
rsync -r --exclude=.svn --exclude-from=../excludefile.txt ../* .
rm chrome.manifest
rm chrome.manifest.flat
mv chrome.manifest.jar chrome.manifest
cd chrome
zip -r activities.jar content locale
rm -rf content
rm -rf locale
cd ../..
cd $TOOLBARID
VERSION=`grep "em:version" install.rdf | sed -e 's/[ \t]*em:version=//;s/"//g'`
TOOLBAR=bt-$SHORTNAME-$VERSION
zip -r -D ../$TOOLBAR.xpi *
cd ..
