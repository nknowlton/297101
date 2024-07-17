# Our first R script

# Lines starting with a # are comments. You can write anything you like there and
# it will be ignored when 'run' in R/RStudio. These are useful for adding notes
# to yourself for later.

# This first command loads up the `tidyverse` library/package which includes
# `ggplot2` for creating pretty charts.
library(tidyverse)

# Now we'll load some data on earthquakes from around Fiji
data(quakes)

# Let's plot the earthquake magnitude versus the number
# of stations that detect them
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations))

# You can add more code or comments below here.

# So breaking this down a bit: The ggplot function is used
# to start a plot and assign a dataset to it
ggplot(data=quakes)

# this just gives a blank plot and associates the quakes data with
# the plot.

# Recipe of a plot:

# Step 1: Tell R we want a plot. ggplot()
# Step 2: Associate the dataset we want to plot. data=blah
# Step 3: What type of plot do we want? Points! Use geom_point()
# Step 4: Define what variables we wish to map to features of the plot via aes()

# The aes() bit sets up a mapping of aesthetics (features of the plot)
# to features of our data (columns)
aes(x=mag, y=stations)

# So altogether we get:
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations))

# The + connects multiple functions within a single plot. It's important
# that the + is on the end of a line, not the start of one:
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations))

# Describing the plot

# It is a plot of magnitude versus the number of stations that detect
# the earthquake. There looks to be an increasing trend that is maybe
# fairly straight with some scatter about the trend.

# There are a few earthquakes of magnitude 5.3 that were detected at
# fewer than 20 stations which is unusual given the trend.

# This makes sense given the varibles we're dealing with: we'd expect
# larger earthquakes to be detected more widely.

# Adding to our plot.

ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations), col='purple', size=1,
             shape='circle filled', alpha=1, fill='green')

# Find out about all the aesthetics with
vignette("ggplot2-specs")

# Colours are available:
colours()

# Setting vs mapping aesthetics:
# To map the colour to features of our data (i.e. a column or variable)
# we'd need to put the col argument inside the aes() mapping bit.

# A common mistake is putting the col argumnet inside the aes() bit
# when we're instead trying to set the colour to be the same for all
# points:
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations, col='asdflkjasdflk'))

# To *SET* an aesthetic to the same value for all observations, place
# the parameter inside the geom, but not inside the aes/mapping bit:
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations), col='purple')

# To *MAP* an aesthetic to a potentially different value for each observation,
# place the parameter inside the aes/mapping bit. It should then come
# from a column in your data:
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations, col=depth))

# Overplotting
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations), alpha=0.4)

# These data have been rounded (number of stations is a whole number, mag
# is rounded to 1 decimal place) so there's potentially multiple
# observations that are identical, which would be indistinguishable
# on a scatterplot unless we can 'see through' the points somehow.
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations))

# This is called overplotting, and two ways to potentially fix it are:
# 1. Transparency (via the alpha parameter)
ggplot(data=quakes) +
  geom_point(mapping=aes(x=mag, y=stations), alpha=0.3)
# 2. Jittering (adding a bit of noise to move each point a bit)
ggplot(data=quakes) +
  geom_jitter(mapping=aes(x=mag, y=stations))

# By default this adds random noise to the observations both x and y.
# The amount of noise added is 80% of the resolution of the data, which
# is 40% of the minimum difference between observations. e.g. for x
# the values are separated by 0.1, so the amount of jitter is 0.04.
ggplot(data=quakes) +
  geom_jitter(mapping=aes(x=mag, y=stations),
              width=0.5, height=0)


