@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
echo LIB=%LIB%
echo LIBPATH=%LIBPATH%
echo INCLUDE=%INCLUDE%
echo UCRTVersion=%UCRTVersion%
echo WindowsSdkDir=%WindowsSdkDir%
echo WindowsSdkVersion=%WindowsSdkVersion%
dir "%WindowsSdkDir%Lib\%WindowsSdkVersion%\um\x64\kernel32.lib" 2>&1
